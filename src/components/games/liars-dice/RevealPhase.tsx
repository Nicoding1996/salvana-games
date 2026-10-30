'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChallengeResult, LiarsDicePhase, LiarsDicePlayerInfo, LiarsDiceSettings } from '@/types/games/liars-dice';
import { LD_REVEAL_INTRO_MS, LD_REVEAL_ROW_MS, LD_ROUND_END_MS, countMatches } from '@/types/games/liars-dice';
import Confetti from '@/components/shared/Confetti';
import DiceIcon from './DiceIcon';
import { Hearts } from './PlayerRing';

interface RevealPhaseProps {
  result: ChallengeResult;
  players: LiarsDicePlayerInfo[];
  phase: LiarsDicePhase;          // 'challenge' while counting, 'roundEnd' once lives are taken
  myId: string | null;
  settings: LiarsDiceSettings;
}

const VERDICT_GAP_MS = 350;

/** Every die is revealed one player at a time, counted against the claim, then the verdict lands. */
export default function RevealPhase({ result, players, phase, myId, settings }: RevealPhaseProps) {
  const rows = players.filter(p => result.allDice[p.id]);
  const face = result.bid.faceValue;
  const verdictAt = LD_REVEAL_INTRO_MS + rows.length * LD_REVEAL_ROW_MS + VERDICT_GAP_MS;

  const [revealed, setRevealed] = useState(0);
  const [showVerdict, setShowVerdict] = useState(false);

  useEffect(() => {
    const timers = rows.map((_, i) => setTimeout(() => setRevealed(i + 1), LD_REVEAL_INTRO_MS + i * LD_REVEAL_ROW_MS));
    timers.push(setTimeout(() => setShowVerdict(true), verdictAt));
    return () => timers.forEach(clearTimeout);
    // Runs once per reveal (the component is keyed by round)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Joining mid-way (reconnect during the round end): show everything at once
  const settled = showVerdict || phase === 'roundEnd';

  // On short screens the verdict lands below the fold: bring it into view
  const outcomeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!settled) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    outcomeRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [settled, phase]);
  const revealedCount = settled ? rows.length : revealed;
  const found = rows
    .slice(0, revealedCount)
    .reduce((sum, p) => sum + countMatches(result.allDice[p.id], face, settings.wildOnes), 0);
  const target = result.bid.quantity;

  const caller = players.find(p => p.id === result.callerId);
  const bidder = players.find(p => p.id === result.bidderId);
  const name = (id: string, fallback: string) => (id === myId ? 'You' : players.find(p => p.id === id)?.name ?? fallback);
  const loserNames = result.loserIds.map(id => name(id, 'Someone'));

  const iLose = !!myId && result.loserIds.includes(myId);
  const iWonChallenge = !!myId && !iLose && (myId === result.callerId || myId === result.bidderId);

  let verdict: string;
  if (result.type === 'liar') {
    verdict = result.wasCorrect
      ? `Bluff caught! ${loserNames[0]} lose${loserNames[0] === 'You' ? '' : 's'} a ❤️`
      : `The bid was true! ${loserNames[0]} lose${loserNames[0] === 'You' ? '' : 's'} a ❤️`;
  } else {
    verdict = result.wasCorrect
      ? 'Spot on! Everyone else loses a ❤️'
      : `Not exact. ${loserNames[0]} lose${loserNames[0] === 'You' ? '' : 's'} a ❤️`;
  }

  return (
    <div className="flex flex-1 flex-col px-4">
      {settled && iWonChallenge && <Confetti />}

      {/* The call */}
      <div className="pt-3 text-center">
        <p className="text-sm text-(--text-secondary) animate-fade-in">
          <span aria-hidden="true">{caller?.avatar}</span> {name(result.callerId, result.callerName)}
          {result.auto && <span className="text-(--text-muted)"> (out of time)</span>}
        </p>
        <h2
          className={`font-heading text-4xl font-bold tracking-tight animate-slam-in ${
            result.type === 'liar' ? 'text-(--danger)' : 'text-(--game-secondary)'
          }`}
        >
          {result.type === 'liar' ? 'LIAR!' : 'SPOT ON!'}
        </h2>
      </div>

      {/* The claim */}
      <div className="mx-auto mt-3 flex items-center gap-2 rounded-2xl border border-(--border-light) bg-(--bg-card) px-4 py-2.5">
        <span className="text-xs text-(--text-muted)">
          <span aria-hidden="true">{bidder?.avatar}</span> {name(result.bidderId, result.bidderName)} said {result.type === 'spotOn' ? 'exactly' : 'at least'}
        </span>
        <span className="font-heading text-2xl font-bold tabular-nums text-(--text-primary)">{target}</span>
        <span className="text-(--text-muted)" aria-hidden="true">×</span>
        <DiceIcon value={face} size={30} wild={settings.wildOnes} />
      </div>

      {/* Running count */}
      <div className="mt-4" role="status" aria-live="polite">
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">
            {settled ? 'Counted' : 'Counting…'}
            {settings.wildOnes && face !== 1 && <span className="normal-case tracking-normal"> · 1s are wild</span>}
          </p>
          <p className="font-heading text-lg font-bold tabular-nums">
            <span key={found} className={`inline-block ld-bump ${found >= target ? 'text-(--success)' : 'text-(--text-primary)'}`}>{found}</span>
            <span className="text-sm text-(--text-muted)"> / {target}</span>
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-(--bg-elevated)">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${Math.min(100, (found / Math.max(1, target)) * 100)}%`,
              background: found >= target ? 'var(--success)' : 'var(--game-secondary)',
            }}
          />
        </div>
      </div>

      {/* Everyone's dice */}
      <ul className="mt-3 space-y-1.5">
        {rows.map((p, i) => {
          const dice = result.allDice[p.id];
          const shown = i < revealedCount;
          const count = countMatches(dice, face, settings.wildOnes);
          const loser = settled && result.loserIds.includes(p.id);
          return (
            <li
              key={p.id}
              className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 transition-colors duration-300 ${
                loser ? 'border-(--danger)/35 bg-(--danger-dim)' : 'border-(--border) bg-(--bg-card)'
              } ${loser && phase === 'roundEnd' ? 'animate-shake-once' : ''}`}
            >
              <span className="text-lg" aria-hidden="true">{p.avatar}</span>
              <div className="w-14 min-w-0">
                <p className="truncate text-xs font-semibold text-(--text-primary)">{p.id === myId ? 'You' : p.name}</p>
                {phase === 'roundEnd' ? (
                  p.alive ? <Hearts lives={p.lives} max={p.maxLives} /> : <span className="text-[10px] font-bold text-(--danger)">💀 Out</span>
                ) : (
                  p.left && <span className="text-[10px] text-(--text-muted)">left</span>
                )}
              </div>
              <div className="flex flex-1 justify-end gap-1">
                {dice.map((v, j) => (
                  <DiceIcon
                    key={`${j}-${shown}`}
                    value={v}
                    size={28}
                    hidden={!shown}
                    wild={settings.wildOnes}
                    highlighted={shown && countMatches([v], face, settings.wildOnes) > 0}
                    dim={shown && countMatches([v], face, settings.wildOnes) === 0}
                    className={shown ? 'animate-dice-reveal' : ''}
                    style={shown ? { animationDelay: `${j * 45}ms` } : undefined}
                  />
                ))}
              </div>
              <span
                className={`w-6 text-right font-heading text-sm font-bold tabular-nums ${
                  !shown ? 'text-(--text-muted)' : count > 0 ? 'text-(--game-accent)' : 'text-(--text-muted)'
                }`}
              >
                {shown ? count : '·'}
              </span>
            </li>
          );
        })}
      </ul>

      <div ref={outcomeRef} className="ld-safe-bottom">
      {/* Verdict */}
      {settled && (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-center ld-verdict ${
            result.wasCorrect ? 'border-(--success)/30 bg-(--success-dim)' : 'border-(--danger)/30 bg-(--danger-dim)'
          }`}
        >
          <p className="font-heading text-lg font-bold text-(--text-primary)">
            {result.actualCount} {result.actualCount === 1 ? 'die' : 'dice'} vs {target} claimed
          </p>
          <p className={`mt-0.5 text-sm font-semibold ${result.wasCorrect ? 'text-(--success)' : 'text-(--danger)'}`}>{verdict}</p>
          {iLose && <p className="mt-1 text-sm text-(--text-secondary)">💔 That one hurts</p>}
          {iWonChallenge && <p className="mt-1 text-sm text-(--text-secondary)">🎉 You won that challenge</p>}
        </div>
      )}

      {phase === 'roundEnd' && (
        <div className="mt-3" role="status">
          <p className="mb-1.5 text-center text-xs text-(--text-muted)">Next round coming up…</p>
          <div className="h-1 overflow-hidden rounded-full bg-(--bg-elevated)">
            <div className="ld-drain h-full rounded-full bg-(--game-accent)" style={{ animationDuration: `${LD_ROUND_END_MS}ms` }} />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
