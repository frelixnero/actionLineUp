import React from 'react';
import { Sparkles, Activity, ShieldCheck, Terminal, AlertCircle } from 'lucide-react';

interface HeaderProps {
  serverStatus: 'connected' | 'checking' | 'error';
  onOpenDiagnostics: () => void;
  onOpenCodeFix: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  serverStatus,
  onOpenDiagnostics,
  onOpenCodeFix
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-3 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold text-lg">
            🎱
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-lg text-white tracking-tight">
                Pool Scorecard OCR Studio
              </h1>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 font-medium px-2 py-0.5 rounded-full border border-emerald-500/30">
                Seguin 8-Ball & BCA
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Intelligent scorecard transcription, 503 recovery cascade & manual scoring verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Server Connection Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
            {serverStatus === 'connected' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-300 font-mono">Gemini API Ready</span>
              </>
            ) : serverStatus === 'checking' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="text-slate-400">Checking API...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-rose-300">API Offline</span>
              </>
            )}
          </div>

          {/* Root cause diagnostics button */}
          <button
            onClick={onOpenDiagnostics}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium transition cursor-pointer"
            title="Inspect why the previous app returned an error"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Why Did It Fail?</span>
          </button>

          {/* Code Fix button */}
          <button
            onClick={onOpenCodeFix}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-sm cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Backend Fix Code</span>
          </button>
        </div>
      </div>
    </header>
  );
};
