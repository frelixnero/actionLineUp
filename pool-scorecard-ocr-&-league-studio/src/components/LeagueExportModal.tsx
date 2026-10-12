import React, { useState } from 'react';
import { X, Copy, Check, Download, FileText, Share2, Facebook } from 'lucide-react';
import type { ScorecardData } from '../types/scorecard.js';

interface LeagueExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ScorecardData | null;
}

export const LeagueExportModal: React.FC<LeagueExportModalProps> = ({
  isOpen,
  onClose,
  data
}) => {
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  if (!isOpen || !data) return null;

  const generateFacebookText = () => {
    const winner =
      data.homeTeam.totalScore > data.awayTeam.totalScore
        ? data.homeTeam.name
        : data.awayTeam.name;

    let text = `🎱 ${data.leagueName || 'BCA POOL LEAGUE'} MATCH REPORT 🎱\n`;
    text += `Race to ${data.raceTo || 13}\n\n`;
    text += `🏆 FINAL SCORE:\n`;
    text += `• ${data.homeTeam.name}: ${data.homeTeam.totalScore} pts\n`;
    text += `• ${data.awayTeam.name}: ${data.awayTeam.totalScore} pts\n`;
    text += `Winner: ${winner}\n\n`;

    text += `👥 HOME ROSTER (${data.homeTeam.name}):\n`;
    text += data.homeTeam.players.map((p, i) => `  ${i + 1}. ${p}`).join('\n') + '\n\n';

    text += `👥 VISITING ROSTER (${data.awayTeam.name}):\n`;
    text += data.awayTeam.players.map((p, i) => `  ${i + 1}. ${p}`).join('\n') + '\n\n';

    if (data.rawNotes) {
      text += `📝 Notes / Dues: ${data.rawNotes}\n`;
    }

    return text;
  };

  const handleCopyText = (text: string, format: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scorecard-${data.homeTeam.name}-vs-${data.awayTeam.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    let csv = 'Game Number,Round,Home Player,Away Player,Winner\n';
    data.games.forEach((g) => {
      csv += `${g.gameNumber},${g.round},"${g.homePlayer}","${g.awayPlayer}","${g.winner || 'unplayed'}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scorecard-${data.homeTeam.name}-vs-${data.awayTeam.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fbText = generateFacebookText();

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Export & Share Match Results</h2>
              <p className="text-xs text-slate-400">Share to league Facebook group, WhatsApp, or export to CSV/JSON</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Quick Copy for Facebook / WhatsApp League Group */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <span>League Group Summary (Facebook / WhatsApp)</span>
              </label>
              <button
                onClick={() => handleCopyText(fbText, 'fb')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer"
              >
                {copiedFormat === 'fb' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Post Text</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {fbText}
            </pre>
          </div>

          {/* Download buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleDownloadCsv}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Download CSV Report</span>
            </button>
            <button
              onClick={handleDownloadJson}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Download Raw JSON</span>
            </button>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
