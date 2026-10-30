'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { Flip7PlayerInfo, Flip7RoundScore } from '@/types/games/flip7';
import { FLIP_7_BONUS, NEXT_ROUND_LOCKOUT_MS } from '@/types/games/flip7';
import Confetti from '@/components/shared/Confetti';
import { ModifierChip, NumberCard, SecondChanceChip } from './CardArt';

interface RoundSummaryProps {
  players: Flip7PlayerInfo[];
  roundScores: Flip7RoundScore[] | null;
  round: number;
  targetScore: number;
  myId: string;
  isHost: boolean;
  onNextRound: () => void;
  onEndGame: () => void;
  endGameConfirm: boolean;
}

export default function RoundSummary({
  players, roundScores, round, targetScore, myId, isHost, onNextRound, onEndGame, endGameConfirm,
}: RoundSummaryProps) {
  const scores = [...(roundScores ?? [])].sort(
    (a, b) => b.cumulativeScore - a.cumulativeScore || b.roundScore - a.roundScore,
  );
  const sevens = scores.filter(s => s.flipSeven);
  const leader = scores[0];
  const tiedAtTop = !!leader && scores.length > 1
    && scores[1].cumulativeScore === leader.cumulativeScore
    && leader.cumulativeScore >= targetScore;
  const nameOf = (s: Flip7RoundScore) => (s.playerId === myId ? 'You' : s.playerName);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / targetScore) * 100))}%`;

  // Short lockout so everyone gets a beat to read the results before the host deals.
  const [lockLeft, setLockLeft] = useState(Math.ceil(NEXT_ROUND_LOCKOUT_MS / 1000));
  useEffect(() => {
    if (lockLeft <= 0) return;
    const t = setTimeout(() => setLockLeft(lockLeft - 1), 1000);
    return () => clearTimeout(t);
  }, [lockLeft]);
  const locked = lockLeft > 0;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col p-4 f7-table">
      {sevens.length > 0 && <Confetti />}

      <div className="mb-4 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-(--text-muted)">First to {targetScore}</p>
        <h2 className="text-xl font-bold text-(--text-primary)">Round {round} results</h2>
      </div>

      {sevens.length > 0 && (
        <div className="mb-4 rounded-2xl border border-(--game-accent)/40 bg-linear-to-r from-(--game-accent)/15 via-(--game-secondary)/15 to-(--game-accent)/15 p-4 text-center flip7-banner-in">
          <p className="text-3xl font-bold tracking-wide text-(--game-accent)">FLIP 7! 🃏</p>
          <p className="mt-1 text-sm font-semibold text-(--text-primary)">
            {sevens.map(nameOf).join(' & ')} collected 7 unique numbers
          </p>
          <p className="mt-0.5 text-xs font-bold text-(--game-secondary)">+{FLIP_7_BONUS} bonus</p>
        </div>
      )}

      <ol className="flex-1 space-y-2 overflow-y-auto">
        {scores.map((s, i) => {
          const p = players.find(pl => pl.id === s.playerId);
          const previous = s.cumulativeScore - s.roundScore;
          const cards = p ? [...p.visibleCards].sort((a, b) => a - b) : [];
          const bar = {
            '--from': pct(previous),
            '--to': pct(s.cumulativeScore),
            background: s.busted ? 'var(--text-muted)' : 'var(--game-accent)',
          } as CSSProperties;

          return (
            <li
              key={s.playerId}
              className={`rounded-xl border px-3 py-2.5 animate-slide-up ${
                s.flipSeven
                  ? 'border-(--game-accent)/40 bg-(--game-accent)/8'
                  : s.playerId === myId
                    ? 'border-(--border-light) bg-(--bg-elevated)'
                    : 'border-(--border) bg-(--bg-card)'
              }`}
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-center text-xs font-bold text-(--text-muted)">{i + 1}</span>
                <span className="text-lg" aria-hidden="true">{p?.avatar ?? '🙂'}</span>
                <span className="truncate text-sm font-semibold text-(--text-primary)">{nameOf(s)}</span>
                {i === 0 && !tiedAtTop && <span aria-label="Leader">👑</span>}
                <span
                  className="ml-auto shrink-0 text-sm font-bold tabular-nums"
                  style={{ color: s.busted ? 'var(--danger)' : 'var(--game-accent)' }}
                >
                  {s.busted ? 'Bust' : `+${s.roundScore}`}
                </span>
              </div>

              {p && (
                <div className={`mt-1.5 flex flex-wrap items-center gap-[3px] pl-7 ${s.busted ? 'f7-busted' : ''}`}>
                  {cards.map(v => <NumberCard key={v} value={v} size="xs" />)}
                  {s.busted && p.bustCard !== null && <NumberCard value={p.bustCard} size="xs" bust />}
                  {p.modifiers.map((m, j) => <ModifierChip key={`${m}-${j}`} kind={m} small />)}
                  {p.hasSecondChance && <SecondChanceChip small />}
                  {p.roundStatus === 'frozen' && <span className="text-[10px] text-(--f7-freeze)">❄️ frozen</span>}
                </div>
              )}

              <div className="mt-2 flex items-center gap-2 pl-7">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--bg-primary)">
                  <div className="h-full rounded-full f7-progress-fill" style={bar} />
                </div>
                <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-(--text-primary)">
                  {s.cumulativeScore}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 space-y-2 f7-safe-bottom">
        {leader && (
          <p className="text-center text-xs text-(--text-secondary)">
            {tiedAtTop
              ? `🤝 Tied at ${leader.cumulativeScore}. The next round decides it!`
              : `${nameOf(leader)} ${leader.playerId === myId ? 'lead' : 'leads'} · ${Math.max(0, targetScore - leader.cumulativeScore)} to go`}
          </p>
        )}
        {isHost ? (
          <>
            <button
              onClick={onNextRound}
              disabled={locked}
              className={`w-full rounded-xl py-3.5 font-semibold transition-all ${
                locked
                  ? 'border border-(--border) bg-(--bg-card) text-(--text-muted)'
                  : 'bg-(--game-accent) text-(--bg-primary) active:scale-[0.97]'
              }`}
            >
              {locked ? `Next round in ${lockLeft}…` : `Deal round ${round + 1} →`}
            </button>
            <button
              onClick={onEndGame}
              className={`w-full rounded-xl py-3 text-xs transition-all ${
                endGameConfirm ? 'bg-(--danger) text-white' : 'border border-(--border) text-(--text-muted)'
              }`}
            >
              {endGameConfirm ? 'Tap again to end game' : 'End Game'}
            </button>
          </>
        ) : (
          <p className="py-3 text-center text-xs text-(--text-muted) animate-soft-pulse">
            Waiting for the host to deal the next round…
          </p>
        )}
      </div>
    </div>
  );
}
