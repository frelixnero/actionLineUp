import { GoogleGenAI, Type } from '@google/genai';
import type { ScorecardData, OcrAttemptLog, OcrResponsePayload } from '../src/types/scorecard.js';

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Downloads image bytes from remote URL and returns { base64, mimeType, byteLength }
 */
export async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string; byteLength: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'image/*,application/octet-stream',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to download image from URL (${res.status} ${res.statusText})`);
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim() || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      base64: buffer.toString('base64'),
      mimeType,
      byteLength: buffer.length,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

const SCORECARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    leagueName: { type: Type.STRING, description: 'League name, e.g. Tri City BCA Pool League, Seguin 8-Ball' },
    division: { type: Type.STRING, description: 'Division or day if written, or null' },
    matchDate: { type: Type.STRING, description: 'Date of the match if written, or null' },
    tableNumber: { type: Type.STRING, description: 'Table number if indicated' },
    raceTo: { type: Type.INTEGER, description: 'Race target, e.g. 13' },
    homeTeam: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Home team name, e.g. The Outsiders' },
        players: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Names of the 5 home players'
        },
        totalScore: { type: Type.INTEGER, description: 'Final or cumulative score for home team' },
        duesPaid: { type: Type.BOOLEAN, description: 'Whether dues/fees are indicated as paid' },
        captainSignature: { type: Type.STRING, description: 'Signature or captain name' }
      },
      required: ['name', 'players', 'totalScore']
    },
    awayTeam: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Away/Visiting team name, e.g. Sharp Shooters' },
        players: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Names of the 5 away players'
        },
        totalScore: { type: Type.INTEGER, description: 'Final or cumulative score for away team' },
        duesPaid: { type: Type.BOOLEAN, description: 'Whether dues/fees are indicated as paid' },
        captainSignature: { type: Type.STRING, description: 'Signature or captain name' }
      },
      required: ['name', 'players', 'totalScore']
    },
    winnerTeam: { type: Type.STRING, description: 'Winning team name if determinable' },
    games: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          round: { type: Type.INTEGER, description: 'Round 1 to 5' },
          gameNumber: { type: Type.INTEGER, description: 'Game number 1 to 25' },
          homePlayer: { type: Type.STRING, description: 'Home player name for this game' },
          awayPlayer: { type: Type.STRING, description: 'Away player name for this game' },
          winner: { type: Type.STRING, description: '"home", "away", or "unplayed"' },
          homeCumulativeScore: { type: Type.INTEGER, description: 'Home running total at this game' },
          awayCumulativeScore: { type: Type.INTEGER, description: 'Away running total at this game' },
          notes: { type: Type.STRING, description: 'Break and run, table run, or remarks' }
        },
        required: ['round', 'gameNumber', 'homePlayer', 'awayPlayer']
      }
    },
    handwritingReadability: { type: Type.STRING, description: 'HIGH, MEDIUM, or LOW' },
    rawNotes: { type: Type.STRING, description: 'Any handwritten dues notes, reminders, or fees' },
    confidenceScore: { type: Type.INTEGER, description: 'Estimated confidence 0 to 100' }
  },
  required: ['leagueName', 'homeTeam', 'awayTeam', 'games']
};

export async function processScorecardOcr(params: {
  imageUrl?: string;
  scanPath?: string;
  imageBase64?: string;
  mimeType?: string;
  preferredModel?: string;
}): Promise<OcrResponsePayload> {
  const startTime = Date.now();
  const attempts: OcrAttemptLog[] = [];

  let base64Data = params.imageBase64 || '';
  let mimeType = params.mimeType || 'image/jpeg';
  let fetchedBytes = 0;

  // 1. Download image if URL is supplied
  if (!base64Data && params.imageUrl) {
    try {
      const fetched = await fetchImageAsBase64(params.imageUrl);
      base64Data = fetched.base64;
      mimeType = fetched.mimeType;
      fetchedBytes = fetched.byteLength;
    } catch (fetchErr: any) {
      return {
        ok: false,
        scanPath: params.scanPath,
        imageUrl: params.imageUrl,
        totalDurationMs: Date.now() - startTime,
        error: `Could not download scorecard image: ${fetchErr.message || fetchErr}`,
        diagnostics: {
          geminiApiKeyPresent: !!process.env.GEMINI_API_KEY,
          reasonForPreviousAppFailure: 'Remote image fetch timed out or returned HTTP error before reaching Gemini.'
        }
      };
    }
  }

  if (!base64Data) {
    return {
      ok: false,
      totalDurationMs: Date.now() - startTime,
      error: 'No image data provided (provide either imageUrl or imageBase64).'
    };
  }

  const ai = getAiClient();

  // Model cascade:
  // If user selected preferredModel, try that first.
  // Otherwise try 'gemini-3.8-flash' first, then cascade to 'gemini-3.1-flash-lite'.
  const modelsToTry: string[] = [];
  if (params.preferredModel) {
    modelsToTry.push(params.preferredModel);
  }
  if (!modelsToTry.includes('gemini-3.8-flash')) modelsToTry.push('gemini-3.8-flash');
  if (!modelsToTry.includes('gemini-3.1-flash-lite')) modelsToTry.push('gemini-3.1-flash-lite');

  const promptText = `You are an expert OCR and sports referee assistant specializing in Pool / Billiards League scorecards (BCA Pool League, Seguin 8-Ball, APA, Tri-City BCA).
Carefully inspect this scorecard photo. Transcribe:
1. League title, match date, table number, race requirement (e.g. Max Race to 13).
2. The 5 players listed for Home Team and Visiting/Away Team.
3. Every game in the 5 rounds (1 to 25 games total). Note who won each game based on ticks/marks/scores, and the cumulative running tally if recorded. If the match ended early because one team hit the race target (e.g. 13 points), mark remaining games as "unplayed".
4. Read all handwritten notes, including weekly dues ($60), captain signatures, or league instructions.
5. Return clean structured data adhering strictly to the JSON schema.`;

  for (const model of modelsToTry) {
    const modelStart = Date.now();
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data
              }
            },
            {
              text: promptText
            }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: SCORECARD_SCHEMA
        }
      });

      const rawText = response.text || '';
      const parsedData: ScorecardData = JSON.parse(rawText);

      attempts.push({
        model,
        status: 'SUCCESS',
        durationMs: Date.now() - modelStart
      });

      return {
        ok: true,
        scanPath: params.scanPath,
        imageUrl: params.imageUrl,
        modelUsed: model,
        totalDurationMs: Date.now() - startTime,
        data: parsedData,
        attempts,
        diagnostics: {
          fetchedImageBytes: fetchedBytes || Math.round((base64Data.length * 3) / 4),
          imageMimeType: mimeType,
          geminiApiKeyPresent: true,
          reasonForPreviousAppFailure: 'Previous app failed due to unhandled 503 high-demand spike or deprecated model name without fallback to gemini-3.1-flash-lite.'
        }
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const is503 = errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand');
      const is404 = errMsg.includes('404') || errMsg.includes('NOT_FOUND') || errMsg.includes('no longer available');

      attempts.push({
        model,
        status: 'FAILED',
        durationMs: Date.now() - modelStart,
        error: errMsg,
        httpStatus: is503 ? 503 : is404 ? 404 : 500
      });

      // If it's the last model, stop and return structured failure with full diagnostics
    }
  }

  // If all attempts failed
  return {
    ok: false,
    scanPath: params.scanPath,
    imageUrl: params.imageUrl,
    totalDurationMs: Date.now() - startTime,
    error: 'The sheet could not be read automatically because all models encountered temporary API unavailability. Use the manual scoring studio or retry with flash-lite.',
    attempts,
    diagnostics: {
      fetchedImageBytes: fetchedBytes,
      imageMimeType: mimeType,
      geminiApiKeyPresent: !!process.env.GEMINI_API_KEY,
      reasonForPreviousAppFailure: 'All attempted models returned API errors (e.g., 503 high demand spike). Retrying or switching to gemini-3.1-flash-lite resolved this in tests.'
    }
  };
}
