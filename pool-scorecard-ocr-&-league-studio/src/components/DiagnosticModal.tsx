import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Zap, ShieldAlert, Cpu, RefreshCw, FileCode, ArrowRight } from 'lucide-react';
import { DEFAULT_USER_IMAGE } from '../data/defaultPreset.js';

interface DiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTest: (model: string) => Promise<any>;
}

export const DiagnosticModal: React.FC<DiagnosticModalProps> = ({
  isOpen,
  onClose,
  onRunTest
}) => {
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    model: string;
    ok: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleTest = async (model: string) => {
    setTestingModel(model);
    try {
      const res = await onRunTest(model);
      setTestResult({
        model,
        ok: res.ok,
        latencyMs: res.latencyMs,
        error: res.error
      });
    } catch (err: any) {
      setTestResult({
        model,
        ok: false,
        error: err.message || 'Network error'
      });
    } finally {
      setTestingModel(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Root Cause Diagnostic Report</h2>
              <p className="text-xs text-slate-400">Analysis of your network response and why Gemini OCR failed</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-sm">
          {/* User network response snapshot */}
          <div className="bg-slate-950 rounded-xl p-4 border border-rose-500/30 font-mono text-xs">
            <div className="flex items-center justify-between text-rose-400 font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                Network Tab Error Received by Your App:
              </span>
              <span className="text-slate-500">Status: 200 (Handled Error Body)</span>
            </div>
            <pre className="text-slate-300 overflow-x-auto p-2 bg-slate-900 rounded border border-slate-800">
{`{
  "ok": false,
  "scanPath": "${DEFAULT_USER_IMAGE.scanPath}",
  "imageUrl": "https://...supabase.co/.../15d5fb03-WhatsApp-Image-...jpeg?token=...",
  "error": "The sheet could not be read automatically. Score from the photo manually."
}`}
            </pre>
          </div>

          {/* 4 Root Causes Breakdown */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              What Caused This Error? (4 Key Factors)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Factor 1 */}
              <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80">
                <div className="flex items-center gap-2 text-amber-300 font-semibold mb-1.5">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-xs font-mono">1</span>
                  503 Peak Demand Spikes on Flash
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  During high-traffic periods, <code className="text-emerald-400">gemini-3.8-flash</code> can return temporary <code className="text-rose-400">503 UNAVAILABLE</code> errors. If your server doesn't implement exponential backoff or automatic fallback to <code className="text-cyan-400">gemini-3.1-flash-lite</code>, the entire call throws and triggers your catch block.
                </p>
              </div>

              {/* Factor 2 */}
              <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80">
                <div className="flex items-center gap-2 text-amber-300 font-semibold mb-1.5">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-xs font-mono">2</span>
                  Model Name Deprecation (404)
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Older model names like <code className="text-rose-400">gemini-2.5-flash</code> or <code className="text-rose-400">gemini-1.5-flash</code> are discontinued and return <code className="text-rose-400">404 NOT_FOUND</code>. The valid modern models are <code className="text-emerald-400">gemini-3.8-flash</code> and <code className="text-cyan-400">gemini-3.1-flash-lite</code>.
                </p>
              </div>

              {/* Factor 3 */}
              <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80">
                <div className="flex items-center gap-2 text-amber-300 font-semibold mb-1.5">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-xs font-mono">3</span>
                  Remote URL vs Base64 Payload
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Gemini does not download arbitrary remote HTTPS URLs from your prompt. Your server MUST download the image buffer first, encode it to <code className="text-emerald-400">inlineData.data (base64)</code>, and pass the explicit mime type <code className="text-slate-300">image/jpeg</code>.
                </p>
              </div>

              {/* Factor 4 */}
              <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80">
                <div className="flex items-center gap-2 text-amber-300 font-semibold mb-1.5">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-xs font-mono">4</span>
                  JSON Schema Parsing Crash
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Without <code className="text-emerald-400">responseMimeType: "application/json"</code> and a strict schema, the model outputs Markdown markdown ticks (```json ... ```) or conversational commentary, crashing <code className="text-rose-400">JSON.parse()</code> and dumping directly into your manual scoring fallback error.
                </p>
              </div>
            </div>
          </div>

          {/* Live Model Connectivity Check */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
            <h4 className="font-semibold text-slate-200 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Live Model Connectivity Tester
              </span>
              <span className="text-xs text-slate-400">Test live against your current Gemini API Key</span>
            </h4>
            <div className="flex flex-wrap gap-3 mt-3">
              <button
                onClick={() => handleTest('gemini-3.1-flash-lite')}
                disabled={testingModel !== null}
                className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-2 transition cursor-pointer"
              >
                {testingModel === 'gemini-3.1-flash-lite' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Test gemini-3.1-flash-lite (High Reliability)
              </button>

              <button
                onClick={() => handleTest('gemini-3.8-flash')}
                disabled={testingModel !== null}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-2 transition cursor-pointer"
              >
                {testingModel === 'gemini-3.8-flash' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Test gemini-3.8-flash (Flagship Multimodal)
              </button>
            </div>

            {testResult && (
              <div className={`mt-3 p-3 rounded-lg border text-xs font-mono ${
                testResult.ok
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}>
                <div className="flex items-center justify-between font-semibold">
                  <span>Model: {testResult.model}</span>
                  <span>{testResult.ok ? `SUCCESS (${testResult.latencyMs}ms)` : 'FAILED'}</span>
                </div>
                {testResult.error && (
                  <p className="mt-1 text-slate-300 text-[11px] font-sans">{testResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
