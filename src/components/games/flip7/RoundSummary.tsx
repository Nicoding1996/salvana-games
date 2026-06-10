'use client';

import { useState, useEffect } from 'react';
import type { Flip7PlayerInfo } from '@/types/games/flip7';
import Confetti from '@/components/shared/Confetti';

// Seconds the round summary stays locked so all players can read the results
const NEXT_ROUND_LOCKOUT = 3;

interface RoundSummaryProps {
  players: Flip7PlayerInfo[];
  roundScores: { playerId: string; playerName: string; roundScore: number; cumulativeScore: number; busted: boolean }[] | null;
  round: number;
  flipSevenBy: string | null;
  winnerId: string | null;
  isHost: boolean;
  onNextRound: () => void;
  onEndGame: () => void;
  endGameConfirm: boolean;
}

export default function RoundSummary({
  players, roundScores, round, flipSevenBy, winnerId, isHost, onNextRound, onEndGame, endGameConfirm
}: RoundSummaryProps) {
  const sorted = roundScores
    ? [...roundScores].sort((a, b) => b.cumulativeScore - a.cumulativeScore)
    : [];

  const flipSevenPlayer = players.find(p => p.id === flipSevenBy);

  // Countdown lockout so everyone gets a beat to read the round results
  // before the host can advance.
  const [lockRemaining, setLockRemaining] = useState(NEXT_ROUND_LOCKOUT);

  useEffect(() => {
    const interval = setInterval(() => {
      setLockRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const locked = lockRemaining > 0;

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full p-4" data-game="flip-7">
      {flipSevenBy && <Confetti />}

      {/* Flip 7 celebration banner */}
      {flipSevenPlayer && (
        <div className="flip7-banner-in mb-4 rounded-2xl p-4 text-center bg-linear-to-r from-(--game-accent)/20 via-(--game-secondary)/20 to-(--game-accent)/20 border border-(--game-accent)/40">
          <p className="text-3xl font-extrabold tracking-wide text-(--game-accent)">FLIP 7! 🃏</p>
          <p className="text-sm font-semibold text-(--text-primary) mt-1">
            {flipSevenPlayer.avatar} {flipSevenPlayer.name} collected 7 unique cards
          </p>
          <p className="text-xs text-(--game-secondary) font-bold mt-0.5">+15 bonus points</p>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold text-(--text-primary)">Round {round} Complete</h2>
      </div>

      {/* Leaderboard */}
      <div className="space-y-2 flex-1 overflow-y-auto">
        {sorted.map((entry, i) => {
          const player = players.find(p => p.id === entry.playerId);
          const isFlip7 = entry.playerId === flipSevenBy;
          return (
            <div
              key={entry.playerId}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                entry.busted
                  ? 'bg-(--bg-card)/50 border-(--border) opacity-60'
                  : isFlip7
                    ? 'bg-(--game-accent)/10 border-(--game-accent)/30'
                    : 'bg-(--bg-card) border-(--border)'
              }`}
            >
              <span className="text-sm font-bold text-(--text-muted) w-5">{i + 1}</span>
              <span className="text-lg">{player?.avatar || '😎'}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-(--text-primary)">{entry.playerName}</p>
                <p className="text-[10px] text-(--text-muted)">
                  {entry.busted ? '💀 Busted' : `+${entry.roundScore} this round`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-(--text-primary)">{entry.cumulativeScore}</p>
                {!entry.busted && (
                  <p className="text-[10px] text-(--game-accent) font-semibold">+{entry.roundScore}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-4 space-y-2">
        {isHost && !winnerId && (
          <button
            onClick={onNextRound}
            disabled={locked}
            className={`w-full py-3.5 rounded-xl font-semibold transition-all ${
              locked
                ? 'bg-(--bg-card) border border-(--border) text-(--text-muted)'
                : 'bg-(--game-accent) text-black active:scale-[0.97]'
            }`}
          >
            {locked ? `Next round in ${lockRemaining}…` : 'Next Round →'}
          </button>
        )}
        {winnerId && (
          <p className="text-center text-sm text-(--game-accent) font-semibold">
            🏆 Game Over! {players.find(p => p.id === winnerId)?.name} wins!
          </p>
        )}
        {!isHost && !winnerId && (
          <p className="text-center text-xs text-(--text-muted)">Waiting for host...</p>
        )}
        {isHost && (
          <button
            onClick={onEndGame}
            className={`w-full py-2.5 rounded-xl text-xs transition-all ${
              endGameConfirm
                ? 'bg-(--danger) text-white'
                : 'text-(--text-muted) border border-(--border)'
            }`}
          >
            {endGameConfirm ? 'Tap again to end game' : 'End Game'}
          </button>
        )}
      </div>
    </div>
  );
}
