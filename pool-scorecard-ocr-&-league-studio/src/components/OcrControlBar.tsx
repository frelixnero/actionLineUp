import React, { useState } from 'react';
import {
  Play,
  RefreshCw,
  Upload,
  Link as LinkIcon,
  CheckCircle,
  AlertTriangle,
  Download,
  Share2,
  Cpu
} from 'lucide-react';
import { DEFAULT_USER_IMAGE } from '../data/defaultPreset.js';

interface OcrControlBarProps {
  onRunOcr: (options: {
    imageUrl?: string;
    imageBase64?: string;
    preferredModel?: string;
  }) => Promise<void>;
  isLoading: boolean;
  modelUsed?: string;
  durationMs?: number;
  onOpenExport: () => void;
  hasData: boolean;
}

export const OcrControlBar: React.FC<OcrControlBarProps> = ({
  onRunOcr,
  isLoading,
  modelUsed,
  durationMs,
  onOpenExport,
  hasData
}) => {
  const [selectedPreset, setSelectedPreset] = useState<'default' | 'url' | 'upload'>('default');
  const [customUrl, setCustomUrl] = useState<string>('');
  const [preferredModel, setPreferredModel] = useState<string>('');

  const handleRun = () => {
    if (selectedPreset === 'default') {
      onRunOcr({
        imageUrl: DEFAULT_USER_IMAGE.imageUrl,
        preferredModel: preferredModel || undefined
      });
    } else if (selectedPreset === 'url') {
      if (!customUrl.trim()) return;
      onRunOcr({
        imageUrl: customUrl.trim(),
        preferredModel: preferredModel || undefined
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      const mimeType = file.type || 'image/jpeg';

      onRunOcr({
        imageBase64: base64Data,
        preferredModel: preferredModel || undefined
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Source preset selector */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setSelectedPreset('default')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              selectedPreset === 'default'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Your Scan Preset (Seguin 8-Ball)
          </button>
          <button
            onClick={() => setSelectedPreset('upload')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              selectedPreset === 'upload'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Upload Photo
          </button>
          <button
            onClick={() => setSelectedPreset('url')}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              selectedPreset === 'url'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Paste Signed URL
          </button>
        </div>

        {/* Model selector & Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={preferredModel}
              onChange={(e) => setPreferredModel(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-slate-200">
                Cascade (3.8-Flash → 3.1-Flash-Lite)
              </option>
              <option value="gemini-3.1-flash-lite" className="bg-slate-900 text-slate-200">
                gemini-3.1-flash-lite (Fastest & Most Stable)
              </option>
              <option value="gemini-3.8-flash" className="bg-slate-900 text-slate-200">
                gemini-3.8-flash (High Resolution)
              </option>
            </select>
          </div>

          {/* Primary Action Button */}
          {selectedPreset === 'upload' ? (
            <label className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Choose Image File</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isLoading}
              />
            </label>
          ) : (
            <button
              onClick={handleRun}
              disabled={isLoading || (selectedPreset === 'url' && !customUrl.trim())}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Gemini OCR...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Gemini OCR</span>
                </>
              )}
            </button>
          )}

          {/* Export Report */}
          {hasData && (
            <button
              onClick={onOpenExport}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export League Report</span>
            </button>
          )}
        </div>
      </div>

      {/* URL input field if URL preset selected */}
      {selectedPreset === 'url' && (
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            placeholder="Paste Supabase storage signed URL or photo URL..."
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
          />
        </div>
      )}

      {/* Success / Status readout */}
      {modelUsed && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <CheckCircle className="w-3.5 h-3.5" />
            Transcribed successfully via <code>{modelUsed}</code>
          </span>
          {durationMs && (
            <span className="font-mono text-slate-500">
              Latency: {(durationMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>
      )}
    </div>
  );
};
