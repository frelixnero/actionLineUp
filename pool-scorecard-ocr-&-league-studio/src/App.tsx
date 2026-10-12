/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { ScorecardImageViewer } from './components/ScorecardImageViewer.js';
import { ScorecardEditor } from './components/ScorecardEditor.js';
import { OcrControlBar } from './components/OcrControlBar.js';
import { DiagnosticModal } from './components/DiagnosticModal.js';
import { CodeFixModal } from './components/CodeFixModal.js';
import { LeagueExportModal } from './components/LeagueExportModal.js';
import { DEFAULT_USER_IMAGE } from './data/defaultPreset.js';
import type { ScorecardData, OcrResponsePayload } from './types/scorecard.js';
import { AlertTriangle, Sparkles, CheckCircle2, ChevronRight, Info } from 'lucide-react';

export default function App() {
  const [serverStatus, setServerStatus] = useState<'connected' | 'checking' | 'error'>('checking');
  const [imageUrl, setImageUrl] = useState<string>(DEFAULT_USER_IMAGE.imageUrl);
  const [scorecardData, setScorecardData] = useState<ScorecardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [modelUsed, setModelUsed] = useState<string | undefined>(undefined);
  const [durationMs, setDurationMs] = useState<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [showCodeFix, setShowCodeFix] = useState<boolean>(false);
  const [showExport, setShowExport] = useState<boolean>(false);

  // Check server health on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') {
          setServerStatus('connected');
        } else {
          setServerStatus('error');
        }
      })
      .catch(() => setServerStatus('error'));
  }, []);

  // Run OCR analysis
  const handleRunOcr = async (options: {
    imageUrl?: string;
    imageBase64?: string;
    preferredModel?: string;
  }) => {
    setIsLoading(true);
    setErrorMessage(null);

    if (options.imageUrl) {
      setImageUrl(options.imageUrl);
    }

    try {
      const response = await fetch('/api/ocr/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: options.imageUrl,
          imageBase64: options.imageBase64,
          preferredModel: options.preferredModel,
          scanPath: DEFAULT_USER_IMAGE.scanPath
        })
      });

      const result: OcrResponsePayload = await response.json();

      if (result.ok && result.data) {
        setScorecardData(result.data);
        setModelUsed(result.modelUsed);
        setDurationMs(result.totalDurationMs);
      } else {
        setErrorMessage(
          result.error || 'The sheet could not be read automatically. Score from the photo manually.'
        );
      }
    } catch (err: any) {
      setErrorMessage(
        `Network error calling OCR server: ${err.message || err}. Use the manual score entry below.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestModel = async (model: string) => {
    const res = await fetch('/api/diagnose/test-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    return await res.json();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header */}
      <Header
        serverStatus={serverStatus}
        onOpenDiagnostics={() => setShowDiagnostics(true)}
        onOpenCodeFix={() => setShowCodeFix(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4 flex flex-col">
        {/* Banner with context about the user's issue and quick resolve */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">
                  Scorecard OCR Reader & Resolution Studio
                </h2>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                  Preloaded: WhatsApp Scan
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Targeting <code className="text-slate-300 font-mono text-[11px]">seguin-8ball / WhatsApp-Image-2026-10-12</code>. Click <strong>"Run Gemini OCR"</strong> to transcribe teams, players, and match scores.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDiagnostics(true)}
              className="text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              <span>See why your app gave an error</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-4 flex items-start justify-between gap-3 text-xs text-rose-200">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-300">Automatic OCR Notice</p>
                <p className="text-rose-200/90 mt-0.5">{errorMessage}</p>
                <p className="text-slate-400 mt-1">
                  You can score directly using the interactive editor on the right, or retry with <code className="text-cyan-300">gemini-3.1-flash-lite</code> above.
                </p>
              </div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 text-[11px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* OCR Control Bar */}
        <OcrControlBar
          onRunOcr={handleRunOcr}
          isLoading={isLoading}
          modelUsed={modelUsed}
          durationMs={durationMs}
          onOpenExport={() => setShowExport(true)}
          hasData={!!scorecardData}
        />

        {/* Side-by-Side Workstation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[580px]">
          {/* Left Side: Scorecard Photo Viewer */}
          <div className="h-full min-h-[460px]">
            <ScorecardImageViewer
              imageUrl={imageUrl}
              imageTitle="Seguin 8-Ball / Tri City BCA Scorecard"
            />
          </div>

          {/* Right Side: Scorecard Data & Fallback Editor */}
          <div className="h-full min-h-[460px]">
            <ScorecardEditor
              data={scorecardData}
              onUpdateData={setScorecardData}
              isLoading={isLoading}
            />
          </div>
        </div>
      </main>

      {/* Modals */}
      <DiagnosticModal
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
        onRunTest={handleTestModel}
      />

      <CodeFixModal
        isOpen={showCodeFix}
        onClose={() => setShowCodeFix(false)}
      />

      <LeagueExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        data={scorecardData}
      />
    </div>
  );
}
