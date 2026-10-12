/**
 * Gemini vision helpers for the score-sheet scan pipeline.
 *
 * Pure and dependency-light so the failure taxonomy is unit-tested: the
 * production 502 taught us that one catch block for "generate, extract,
 * parse" is undiagnosable. Each stage now reports its own code, transient
 * errors (503/429) are retried, and unknown-model errors (404) fall
 * through to the next model in the cascade instead of failing the scan.
 */

import { SchemaType, type Schema } from "@google/generative-ai";

export type VisionErrorKind =
  | "rate_limited" // 429 / 503: safe to retry with backoff
  | "model_not_found" // 404: try the next model in the cascade
  | "blocked" // safety / recitation block: retrying will not help
  | "bad_response" // unusable payload (empty text, bad JSON)
  | "unknown";

export type VisionStage =
  | "vision-generate"
  | "vision-extract"
  | "vision-parse"
  | "vision-blocked";

const statusOf = (error: unknown): number | null => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/\[(40\d|42\d|50\d)[^\]]*\]/);
  return match ? Number(match[1]) : null;
};

/** Classify an SDK throw so the caller knows retry / fallback / abort. */
export function classifyVisionError(error: unknown): { kind: VisionErrorKind; status: number | null } {
  const status = statusOf(error);
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (status === 429 || status === 503 || /quota|rate.?limit|overloaded|high demand/.test(message)) {
    return { kind: "rate_limited", status };
  }
  if (status === 404 || /not.?found|no longer available|does not exist/.test(message)) {
    return { kind: "model_not_found", status };
  }
  if (/safety|blocked|recitation|finish reason/.test(message)) {
    return { kind: "blocked", status };
  }
  return { kind: status !== null ? "unknown" : "unknown", status };
}

type CandidateLike = { finishReason?: string };
type GenerateResponseLike = {
  candidates?: CandidateLike[];
  promptFeedback?: { blockReason?: string };
  text?: () => string;
};

/**
 * Pull text out of a generate-content response WITHOUT letting the SDK's
 * .text() throw on safety-blocked responses. Returns the block reason
 * instead so the route can report "vision-blocked" precisely.
 */
export function extractResponseText(response: GenerateResponseLike | null | undefined): {
  text: string | null;
  blocked: boolean;
  blockReason?: string;
} {
  if (!response) return { text: null, blocked: false };
  const promptBlock = response.promptFeedback?.blockReason;
  if (promptBlock) return { text: null, blocked: true, blockReason: promptBlock };
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && !["STOP", "MAX_TOKENS"].includes(finish)) {
    return { text: null, blocked: true, blockReason: finish };
  }
  if (!response.candidates || response.candidates.length === 0) {
    return { text: null, blocked: false };
  }
  try {
    const text = typeof response.text === "function" ? response.text() : null;
    if (!text || !text.trim()) return { text: null, blocked: false };
    return { text, blocked: false };
  } catch {
    return { text: null, blocked: true, blockReason: finish ?? "TEXT_UNAVAILABLE" };
  }
}

/** First balanced {...} span, for models that talk around the JSON. */
export function extractJsonSpan(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

const cleanModel = (value: string) => value.trim().replace(/^models\//, "").slice(0, 80);

/**
 * Model cascade: explicit env list wins, otherwise the compiled default.
 * Verify names with `GET /v1beta/models` before changing — unverified
 * model names are how scans die with 404.
 */
export function parseModelCascade(envValue: string | undefined, fallback: string[]): string[] {
  const fromEnv = (envValue ?? "")
    .split(",")
    .map(cleanModel)
    .filter(Boolean);
  const list = fromEnv.length > 0 ? fromEnv : fallback.map(cleanModel).filter(Boolean);
  return [...new Set(list)].slice(0, 3);
}

export const DEFAULT_SCAN_MODELS = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash"];

/** Strict output contract so the model cannot answer in prose. */
export const SCORECARD_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    leagueName: { type: SchemaType.STRING, nullable: true },
    homeTeam: { type: SchemaType.STRING },
    awayTeam: { type: SchemaType.STRING },
    homeTotal: { type: SchemaType.INTEGER },
    visitorTotal: { type: SchemaType.INTEGER },
    raceTarget: { type: SchemaType.INTEGER, nullable: true },
    rawNotes: { type: SchemaType.STRING, nullable: true, description: "Handwritten dues notes, reminders, or fees" },
    games: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          gameNumber: { type: SchemaType.INTEGER },
          roundNumber: { type: SchemaType.INTEGER, nullable: true },
          homePlayer: { type: SchemaType.STRING },
          visitorPlayer: { type: SchemaType.STRING },
          winner: { type: SchemaType.STRING, description: "One of: home, visitor, unplayed (post-race games), unknown (illegible)" },
          homeBreak: { type: SchemaType.BOOLEAN, nullable: true },
          visitorBreak: { type: SchemaType.BOOLEAN, nullable: true },
          homeRunningScore: { type: SchemaType.INTEGER, nullable: true },
          visitorRunningScore: { type: SchemaType.INTEGER, nullable: true },
        },
        required: ["gameNumber", "homePlayer", "visitorPlayer", "winner"],
      },
    },
  },
  required: ["homeTeam", "awayTeam", "homeTotal", "visitorTotal", "games"],
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
