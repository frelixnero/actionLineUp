import React, { useState } from 'react';
import {
  Trophy,
  Users,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Edit2,
  Save,
  Check,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import type { ScorecardData, MatchGame } from '../types/scorecard.js';

interface ScorecardEditorProps {
  data: ScorecardData | null;
  onUpdateData: (newData: ScorecardData) => void;
  isLoading?: boolean;
}

export const ScorecardEditor: React.FC<ScorecardEditorProps> = ({
  data,
  onUpdateData,
  isLoading = false
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'teams' | 'notes'>('matrix');

  if (isLoading) {
    return (
      <div className="h-full bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center animate-pulse">
          <Sparkles className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-200">Analyzing Pool Scorecard...</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            Transcribing team rosters, game ticks, and race to 13 results via Gemini OCR cascade.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
          🎱
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-200">No Scorecard Data Loaded</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            Click <strong>"Run Gemini OCR"</strong> above to parse the photo or use manual entry below.
          </p>
        </div>
      </div>
    );
  }

  const handleWinnerToggle = (gameIndex: number) => {
    const updatedGames = [...data.games];
    const currentGame = updatedGames[gameIndex];
    if (!currentGame) return;

    let nextWinner: 'home' | 'away' | 'unplayed' = 'home';
    if (currentGame.winner === 'home') nextWinner = 'away';
    else if (currentGame.winner === 'away') nextWinner = 'unplayed';
    else if (currentGame.winner === 'unplayed') nextWinner = 'home';

    updatedGames[gameIndex] = {
      ...currentGame,
      winner: nextWinner
    };

    // Recalculate totals
    const homeWins = updatedGames.filter((g) => g.winner === 'home').length;
    const awayWins = updatedGames.filter((g) => g.winner === 'away').length;

    onUpdateData({
      ...data,
      games: updatedGames,
      homeTeam: { ...data.homeTeam, totalScore: homeWins },
      awayTeam: { ...data.awayTeam, totalScore: awayWins },
      winnerTeam:
        homeWins >= (data.raceTo || 13)
          ? data.homeTeam.name
          : awayWins >= (data.raceTo || 13)
          ? data.awayTeam.name
          : undefined
    });
  };

  const handlePlayerNameChange = (team: 'home' | 'away', index: number, newName: string) => {
    const updatedTeam = team === 'home' ? { ...data.homeTeam } : { ...data.awayTeam };
    const newPlayers = [...updatedTeam.players];
    newPlayers[index] = newName;
    updatedTeam.players = newPlayers;

    // Update player names in games as well
    const updatedGames = data.games.map((game) => {
      if (team === 'home' && game.homePlayer === data.homeTeam.players[index]) {
        return { ...game, homePlayer: newName };
      }
      if (team === 'away' && game.awayPlayer === data.awayTeam.players[index]) {
        return { ...game, awayPlayer: newName };
      }
      return game;
    });

    onUpdateData({
      ...data,
      [team === 'home' ? 'homeTeam' : 'awayTeam']: updatedTeam,
      games: updatedGames
    });
  };

  const homeScore = data.homeTeam.totalScore;
  const awayScore = data.awayTeam.totalScore;
  const raceTarget = data.raceTo || 13;
  const matchCompleted = homeScore >= raceTarget || awayScore >= raceTarget;

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
      {/* Score Header Banner */}
      <div className="p-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                {data.leagueName || 'Pool League'}
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                Race to {raceTarget}
              </span>
              {data.handwritingReadability && (
                <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                  Readability: {data.handwritingReadability}
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-white mt-0.5">
              Match Results & Digital Scorecard
            </h2>
          </div>

          {matchCompleted && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Match Won by {homeScore >= raceTarget ? data.homeTeam.name : data.awayTeam.name}!
              </span>
            </div>
          )}
        </div>

        {/* Scoreboard Cards */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          {/* Home Team */}
          <div className={`p-3 rounded-xl border transition ${
            homeScore >= raceTarget
              ? 'bg-emerald-950/40 border-emerald-500/50'
              : 'bg-slate-800/60 border-slate-700'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Home Team</span>
              {homeScore >= raceTarget && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <h3 className="font-bold text-white text-base truncate">{data.homeTeam.name}</h3>
              <span className="text-2xl font-black text-emerald-400 font-mono ml-2">{homeScore}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 truncate">
              {data.homeTeam.players.filter(Boolean).join(', ')}
            </div>
          </div>

          {/* Away Team */}
          <div className={`p-3 rounded-xl border transition ${
            awayScore >= raceTarget
              ? 'bg-emerald-950/40 border-emerald-500/50'
              : 'bg-slate-800/60 border-slate-700'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Visiting Team</span>
              {awayScore >= raceTarget && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <h3 className="font-bold text-white text-base truncate">{data.awayTeam.name}</h3>
              <span className="text-2xl font-black text-cyan-400 font-mono ml-2">{awayScore}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 truncate">
              {data.awayTeam.players.filter(Boolean).join(', ')}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-800 px-4 bg-slate-950/40">
        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
            activeTab === 'matrix'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          25-Game Matrix ({data.games.length} games recorded)
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
            activeTab === 'teams'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Player Lineup & Captains
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
            activeTab === 'notes'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          League Dues & Sheet Notes
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'matrix' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Click any game to toggle winner: <strong className="text-emerald-400">Home</strong> → <strong className="text-cyan-400">Away</strong> → <strong className="text-slate-500">Unplayed</strong></span>
              <span>Race: First to {raceTarget}</span>
            </div>

            <div className="space-y-1.5">
              {data.games.map((game, idx) => {
                const isHomeWin = game.winner === 'home';
                const isAwayWin = game.winner === 'away';
                const isUnplayed = game.winner === 'unplayed' || !game.winner;

                return (
                  <div
                    key={idx}
                    onClick={() => handleWinnerToggle(idx)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer select-none transition ${
                      isHomeWin
                        ? 'bg-emerald-950/20 border-emerald-500/30 hover:bg-emerald-950/40'
                        : isAwayWin
                        ? 'bg-cyan-950/20 border-cyan-500/30 hover:bg-cyan-950/40'
                        : 'bg-slate-800/40 border-slate-700/60 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-slate-400 w-6">
                        G{game.gameNumber || idx + 1}
                      </span>
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                        R{game.round}
                      </span>

                      {/* Home Player */}
                      <span className={`text-xs font-semibold ${
                        isHomeWin ? 'text-emerald-300 font-bold' : 'text-slate-300'
                      }`}>
                        {game.homePlayer || `Home #${(idx % 5) + 1}`}
                      </span>

                      <span className="text-slate-500 text-xs">vs</span>

                      {/* Away Player */}
                      <span className={`text-xs font-semibold ${
                        isAwayWin ? 'text-cyan-300 font-bold' : 'text-slate-300'
                      }`}>
                        {game.awayPlayer || `Away #${((idx + Math.floor(idx / 5)) % 5) + 1}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isHomeWin && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30">
                          {data.homeTeam.name} Win
                        </span>
                      )}
                      {isAwayWin && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-medium border border-cyan-500/30">
                          {data.awayTeam.name} Win
                        </span>
                      )}
                      {isUnplayed && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          Unplayed (Race Reached)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Home Roster */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {data.homeTeam.name} Lineup
              </h4>
              <div className="space-y-2">
                {data.homeTeam.players.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-5 font-mono">#{i + 1}</span>
                    <input
                      type="text"
                      value={p}
                      onChange={(e) => handlePlayerNameChange('home', i, e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Away Roster */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {data.awayTeam.name} Lineup
              </h4>
              <div className="space-y-2">
                {data.awayTeam.players.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-5 font-mono">#{i + 1}</span>
                    <input
                      type="text"
                      value={p}
                      onChange={(e) => handlePlayerNameChange('away', i, e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-hidden focus:border-cyan-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">
                Transcribed Handwritten Notes & League Fees
              </h4>
              <textarea
                value={data.rawNotes || ''}
                onChange={(e) => onUpdateData({ ...data, rawNotes: e.target.value })}
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500 font-mono"
                placeholder="Weekly dues, captain remarks, reminders..."
              />
              <p className="text-[11px] text-slate-400 mt-2">
                Detected from photo: <em>"Reminder: $60 weekly dues via Cash App. Post scoresheet on Tri City FB page!"</em>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
