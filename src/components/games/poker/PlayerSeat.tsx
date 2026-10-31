'use client';

import { useEffect, useState } from 'react';
import type { Card, LoggedAction, PokerPlayerInfo, PokerTurnTimer } from '@/types/games/poker';
import { sameCard } from '@/types/games/poker';
import type { PokerReactionBubble } from '@/lib/games/poker/usePoker';
import PlayingCard from './PlayingCard';
import { SEAT_ACTION_LABELS, formatChips } from './format';

export interface SeatResult {
  amountWon: number;
  handLabel: string | null;   // shown under tabled cards at showdown
}

interface PlayerSeatProps {
  player: PokerPlayerInfo;
  x: number;                  // % of the table width
  y: number;                  // % of the table height
  handNumber: number;
  isActive: boolean;
  timer: PokerTurnTimer | null;
  lastAction: LoggedAction | null;   // latest action on this street
  tabledCards: Card[] | null;
  winningCards: Card[] | null;
  result: SeatResult | null;
  bountyMode: boolean;
  reaction: PokerReactionBubble | null;
  handOver: boolean;          // pot awarded: show the new stack, not "ALL IN"
}

export default function PlayerSeat({
  player, x, y, handNumber, isActive, timer, lastAction, tabledCards, winningCards, result, bountyMode, reaction, handOver,
}: PlayerSeatProps) {
  const isWinner = !!result && result.amountWon > 0;
  const holdingCards = player.inHand && !player.folded && !tabledCards;
  const status = [
    player.name,
    `${formatChips(player.chips)} chips`,
    player.folded ? 'folded' : null,
    player.allIn ? 'all in' : null,
    !player.connected ? 'away' : null,
    isActive ? 'to act' : null,
  ].filter(Boolean).join(', ');

  return (
    <div
      className={`absolute z-10 flex w-[78px] -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-opacity duration-300 ${
        isActive ? 'poker-seat-active' : ''
      } ${isWinner ? 'poker-seat-winner' : ''} ${player.folded ? 'opacity-45' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }}
      aria-label={status}
    >
      {reaction && (
        <span
          key={reaction.id}
          className="animate-poker-reaction pointer-events-none absolute -top-7 z-20 text-2xl"
          aria-hidden="true"
        >
          {reaction.emoji}
        </span>
      )}

      <div className="relative">
        {/* Cards held face-down, peeking out behind the avatar */}
        {holdingCards && (
          <div key={`backs-${handNumber}`} className="absolute -right-3 -top-1.5 flex" aria-hidden="true">
            <div className="-rotate-12">
              <div className="poker-mini-back animate-poker-mini-deal" />
            </div>
            <div className="-ml-2 rotate-6">
              <div className="poker-mini-back animate-poker-mini-deal" style={{ animationDelay: '90ms' }} />
            </div>
          </div>
        )}

        <div className={`poker-seat-avatar relative ${player.folded ? 'poker-seat-out' : ''}`}>
          <span aria-hidden="true">{player.avatar}</span>
        </div>

        {isActive && timer && <TimerRing secondsLeft={timer.secondsLeft} total={timer.total} />}

        {player.isDealer && (
          <span className="poker-dealer-btn absolute -bottom-1 -left-2" aria-label="Dealer">D</span>
        )}
        {!player.connected && (
          <span
            className="absolute -bottom-1 -right-2 rounded-full bg-(--bg-primary) px-1 text-[9px] font-semibold uppercase text-(--text-secondary) ring-1 ring-(--border-light)"
          >
            away
          </span>
        )}
      </div>

      <div className="poker-plate -mt-1.5 w-full px-1 pb-0.5 pt-1 text-center leading-tight">
        <p className="truncate text-[11px] font-medium text-(--text-primary)">{player.name}</p>
        <p className="flex items-center justify-center gap-1 text-[11px] font-semibold tabular-nums text-(--game-secondary)">
          {player.allIn && !player.folded && !handOver ? (
            <span className="animate-poker-allin text-(--danger)">ALL IN</span>
          ) : (
            formatChips(player.chips)
          )}
          {bountyMode && player.knockouts > 0 && (
            <span className="text-[10px] text-(--text-secondary)" aria-label={`${player.knockouts} knockouts`}>
              💀{player.knockouts}
            </span>
          )}
        </p>
      </div>

      {/* This street's action + chips in front of the player */}
      {lastAction && !result && (
        <span
          key={`${lastAction}-${player.currentBet}`}
          className={`poker-pill animate-poker-feed mt-1 ${
            lastAction === 'fold'
              ? 'text-(--text-muted)'
              : lastAction === 'allIn'
                ? 'text-(--danger)'
                : 'text-(--text-primary)'
          }`}
        >
          {player.currentBet > 0 && <span className="poker-chip" aria-hidden="true" />}
          {SEAT_ACTION_LABELS[lastAction]}
          {player.currentBet > 0 && <span className="text-(--game-secondary)">{formatChips(player.currentBet)}</span>}
        </span>
      )}

      {tabledCards && (
        <div className="mt-1 flex gap-0.5">
          {tabledCards.map((card, i) => {
            const inWinningHand = winningCards ? winningCards.some(c => sameCard(c, card)) : false;
            return (
              <PlayingCard
                key={`${handNumber}-${i}`}
                card={card}
                size="xs"
                highlight={isWinner && inWinningHand}
                dim={!!winningCards && !isWinner}
                className="animate-poker-flip-in"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            );
          })}
        </div>
      )}

      {result?.handLabel && (
        <p className={`mt-0.5 max-w-[92px] text-center text-[10px] font-semibold leading-tight ${
          isWinner ? 'text-(--game-secondary)' : 'text-(--text-secondary)'
        }`}>
          {result.handLabel}
        </p>
      )}

      {isWinner && result && (
        // Rises over the avatar only (short travel) so top seats don't run into the header
        <span
          key={`won-${handNumber}`}
          className="animate-poker-float-up pointer-events-none absolute top-3 z-20 whitespace-nowrap rounded-full bg-(--bg-primary)/85 px-1.5 text-[13px] font-bold text-(--game-secondary)"
        >
          +{formatChips(result.amountWon)}
        </span>
      )}
    </div>
  );
}

/** Steps between the server's once-a-second ticks */
const RING_STEPS_PER_SECOND = 4;

/**
 * Countdown ring around the avatar of the player on the clock. It drains in quarter-second
 * steps between the server's ticks: a CSS transition on stroke-dashoffset would repaint the
 * ring and the felt under it on every frame.
 */
export function TimerRing({ secondsLeft, total, size = 52 }: { secondsLeft: number; total: number; size?: number }) {
  // Steps taken since the last tick; a new tick starts over (adjust-state-while-rendering)
  const [tick, setTick] = useState(secondsLeft);
  const [steps, setSteps] = useState(0);
  if (secondsLeft !== tick) {
    setTick(secondsLeft);
    setSteps(0);
  }
  useEffect(() => {
    const id = setInterval(() => setSteps(s => Math.min(RING_STEPS_PER_SECOND - 1, s + 1)), 1000 / RING_STEPS_PER_SECOND);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const r = size / 2 - 2;
  const circumference = 2 * Math.PI * r;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const fraction = total > 0 ? clamp(secondsLeft / total) : 0;
  const shown = total > 0 ? clamp((secondsLeft - steps / RING_STEPS_PER_SECOND) / total) : 0;
  const stroke = fraction > 0.5 ? 'var(--game-secondary)' : fraction > 0.25 ? 'var(--brand)' : 'var(--danger)';
  const inset = (size - 42) / 2;

  return (
    <svg
      className="pointer-events-none absolute -rotate-90"
      style={{ left: -inset, top: -inset }}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--poker-ring-track)" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - shown)}
        style={{ transition: 'stroke 0.3s ease' }}
      />
    </svg>
  );
}
