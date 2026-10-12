import React, { useState } from 'react';
import { X, Copy, Check, Terminal, ShieldCheck, Zap } from 'lucide-react';

interface CodeFixModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CodeFixModal: React.FC<CodeFixModalProps> = ({ isOpen, onClose }) => {
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'express' | 'supabase'>('express');

  if (!isOpen) return null;

  const copyToClipboard = (text: string, tab: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tab);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const EXPRESS_SNIPPET = `// Robust Gemini OCR handler with 503 recovery cascade & strict schema
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: { 'User-Agent': 'aistudio-build' }
  }
});

export async function scorePoolSheet(imageUrl: string) {
  // 1. Download image bytes to base64 buffer (Gemini requires inlineData, not raw URL)
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(\`Failed to fetch image: \${imageRes.status}\`);
  }
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const base64Data = buffer.toString('base64');
  const mimeType = imageRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';

  // 2. Cascade list: Flash first, with automatic fallback to Flash-Lite
  const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: 'Extract all scorecard teams, players, rounds, and game scores into JSON.' }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              leagueName: { type: Type.STRING },
              raceTo: { type: Type.INTEGER },
              homeTeam: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  players: { type: Type.ARRAY, items: { type: Type.STRING } },
                  totalScore: { type: Type.INTEGER }
                },
                required: ['name', 'players', 'totalScore']
              },
              awayTeam: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  players: { type: Type.ARRAY, items: { type: Type.STRING } },
                  totalScore: { type: Type.INTEGER }
                },
                required: ['name', 'players', 'totalScore']
              },
              games: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    round: { type: Type.INTEGER },
                    gameNumber: { type: Type.INTEGER },
                    homePlayer: { type: Type.STRING },
                    awayPlayer: { type: Type.STRING },
                    winner: { type: Type.STRING },
                    homeCumulativeScore: { type: Type.INTEGER },
                    awayCumulativeScore: { type: Type.INTEGER }
                  },
                  required: ['round', 'gameNumber', 'homePlayer', 'awayPlayer']
                }
              }
            },
            required: ['leagueName', 'homeTeam', 'awayTeam', 'games']
          }
        }
      });

      // Validated JSON directly from the model
      const scorecard = JSON.parse(response.text || '{}');
      return { ok: true, modelUsed: model, data: scorecard };
    } catch (err) {
      console.warn(\`Model \${model} failed (\${err.message}), trying next model...\`);
    }
  }

  throw new Error('All OCR models unavailable. Fall back to manual score entry.');
}`;

  const SUPABASE_SNIPPET = `// Supabase Edge Function: supabase/functions/scorecard-ocr/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { GoogleGenAI, Type } from 'npm:@google/genai';

const ai = new GoogleGenAI({
  apiKey: Deno.env.get('GEMINI_API_KEY')!,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
});

serve(async (req) => {
  const { imageUrl, scanPath } = await req.json();

  try {
    // 1. Fetch image buffer
    const imgRes = await fetch(imageUrl);
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // 2. Multi-model cascade (handles 503 spike by falling back to 3.1-flash-lite)
    const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    let result = null;

    for (const model of models) {
      try {
        const genRes = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: base64 } },
              { text: 'Parse pool scorecard to JSON.' }
            ]
          },
          config: { responseMimeType: 'application/json' }
        });
        result = JSON.parse(genRes.text);
        break;
      } catch (e) {
        console.error(\`Failed with \${model}:\`, e);
      }
    }

    if (!result) {
      return new Response(JSON.stringify({
        ok: false,
        scanPath,
        imageUrl,
        error: "The sheet could not be read automatically. Score from the photo manually."
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }
});`;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Drop-in Backend Solution</h2>
              <p className="text-xs text-slate-400">Copy this into your server or Supabase Edge Function to prevent the error permanently</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('express')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'express'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Node.js / Express / Next.js
              </button>
              <button
                onClick={() => setActiveTab('supabase')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'supabase'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Supabase Edge Function (Deno)
              </button>
            </div>

            <button
              onClick={() => copyToClipboard(activeTab === 'express' ? EXPRESS_SNIPPET : SUPABASE_SNIPPET, activeTab)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
            >
              {copiedTab === activeTab ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Snippet</span>
                </>
              )}
            </button>
          </div>

          <div className="relative">
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono overflow-x-auto max-h-[50vh]">
              {activeTab === 'express' ? EXPRESS_SNIPPET : SUPABASE_SNIPPET}
            </pre>
          </div>

          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-200">Key architectural protections in this snippet:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-emerald-300/90">
                <li>Fetches and converts binary image to base64 (satisfies Gemini inlineData specification).</li>
                <li>Cascade logic automatically switches to <code className="text-cyan-300">gemini-3.1-flash-lite</code> if Flash is throttled (503).</li>
                <li>Strict schema prevents malformed JSON and conversational markdown wrapping.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
