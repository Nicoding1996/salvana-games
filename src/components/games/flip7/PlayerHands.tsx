'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { Flip7PlayerInfo, ModifierCardKind, PlayerRoundStatus } from '@/types/games/flip7';
import { computeRoundScore } from '@/types/games/flip7';
import { FlipPips, ModifierChip, NumberCard, SecondChanceChip } from './CardArt';

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
      style={{ color: tone, background: `color-mix(in srgb, ${tone} 16%, transparent)` }}
    >
      {children}
    </span>
  );
}

function StatusBadge({ status, ready, picking }: { status: PlayerRoundStatus; ready: boolean; picking: boolean }) {
  if (picking) return <Badge tone="var(--f7-flip3)">PICKING</Badge>;
  if (status === 'busted') return <Badge tone="var(--danger)">BUST</Badge>;
  if (status === 'stayed') return <Badge tone="var(--text-secondary)">STAYED</Badge>;
  if (status === 'frozen') return <Badge tone="var(--f7-freeze)">FROZEN</Badge>;
  if (ready) return <Badge tone="var(--game-accent)">READY</Badge>;
  return null;
}

// ---- Your hand: cards fanned out, progress pips, modifiers, live score ----

interface MyHandProps {
  avatar: string;
  totalScore: number;
  targetScore: number;
  cards: number[];
  modifiers: ModifierCardKind[];
  secondChances: number;
  status: PlayerRoundStatus;
  bustCard: number | null;
  isTurn: boolean;
  ready: boolean;
}

export function MyHand({
  avatar, totalScore, targetScore, cards, modifiers, secondChances, status, bustCard, isTurn, ready,
}: MyHandProps) {
  const busted = status === 'busted';
  const score = computeRoundScore(cards, modifiers, busted);
  const sorted = [...cards].sort((a, b) => a - b);
  const showBust = busted && bustCard !== null;
  const slots = sorted.length + (showBust ? 1 : 0);
  const mid = (slots - 1) / 2;
  const overlap = slots > 5 ? -11 : slots > 3 ? -5 : 3;

  const fan = (i: number): CSSProperties => ({
    marginLeft: i === 0 ? 0 : overlap,
    transform: `rotate(${(i - mid) * 3.5}deg) translateY(${Math.abs(i - mid) * 1.6}px)`,
    zIndex: i,
  });

  const shell = status === 'frozen' ? 'flip7-frost' : isTurn ? 'flip7-turn-glow' : '';

  return (
    <section
      aria-label="Your hand"
      className={`flip7-card rounded-2xl p-3 ${shell} ${busted ? 'f7-busted f7-bust-row' : ''}`}
    >
      {status === 'frozen' && (
        <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-4xl opacity-20 select-none">❄️</span>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg" aria-hidden="true">{avatar}</span>
          <h2 className="text-sm font-semibold text-(--text-primary)">Your hand</h2>
          <StatusBadge status={status} ready={ready} picking={false} />
        </div>
        <p className="shrink-0 text-[11px] tabular-nums text-(--text-muted)">
          Total <span className="text-sm font-bold text-(--text-primary)">{totalScore}</span> / {targetScore}
        </p>
      </div>

      <div className="mt-1 flex h-[76px] items-end justify-center">
        {slots === 0 ? (
          <p className="self-center text-xs text-(--text-muted)">No numbers yet</p>
        ) : (
          <>
            {sorted.map((v, i) => (
              <div key={v} style={fan(i)}>
                <NumberCard value={v} size="md" className="f7-land" />
              </div>
            ))}
            {showBust && (
              <div key="bust" style={fan(sorted.length)}>
                <NumberCard value={bustCard} size="md" bust className="f7-land" />
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <FlipPips count={cards.length} />
          {modifiers.map((m, i) => <ModifierChip key={`${m}-${i}`} kind={m} />)}
          {secondChances > 0 && <SecondChanceChip count={secondChances} />}
        </div>
        <p
          className="shrink-0 text-base font-bold tabular-nums"
          style={{ color: busted ? 'var(--danger)' : 'var(--game-accent)' }}
          aria-label={busted ? 'Busted, 0 points this round' : `${score} points this round`}
        >
          {busted ? 'Bust' : `+${score}`}
        </p>
      </div>
    </section>
  );
}

// ---- Another player's hand: one compact row ----

interface OpponentRowProps {
  player: Flip7PlayerInfo;
  isTurn: boolean;
  ready: boolean;
  picking: boolean;
}

export function OpponentRow({ player, isTurn, ready, picking }: OpponentRowProps) {
  const busted = player.roundStatus === 'busted';
  const frozen = player.roundStatus === 'frozen';
  const score = computeRoundScore(player.visibleCards, player.modifiers, busted);
  const sorted = [...player.visibleCards].sort((a, b) => a - b);
  const empty = sorted.length === 0 && player.modifiers.length === 0 && !player.hasSecondChance && !busted;
  const highlighted = isTurn || picking;

  const shell = frozen
    ? 'flip7-frost'
    : highlighted
      ? 'border border-(--game-accent)/60 bg-(--game-accent)/5 flip7-turn-glow'
      : 'border border-(--border) bg-(--bg-card)/70';

  return (
    <div
      data-active={highlighted ? 'true' : undefined}
      className={`relative overflow-hidden rounded-xl px-3 py-2 ${shell} ${busted ? 'f7-busted f7-bust-row' : ''}`}
    >
      {frozen && (
        <span aria-hidden="true" className="pointer-events-none absolute right-20 top-1/2 -translate-y-1/2 text-3xl opacity-20 select-none">❄️</span>
      )}

      <div className="flex min-w-0 items-center gap-2">
        <span className="text-base" aria-hidden="true">{player.avatar}</span>
        <span className="truncate text-[13px] font-semibold text-(--text-primary)">{player.name}</span>
        {!player.connected && <Badge tone="var(--danger)">OFFLINE</Badge>}
        <StatusBadge status={player.roundStatus} ready={ready} picking={picking} />
        <span
          className="ml-auto shrink-0 text-sm font-bold tabular-nums"
          style={{ color: busted ? 'var(--danger)' : 'var(--text-primary)' }}
        >
          {busted ? 'Bust' : `+${score}`}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-[3px]">
          {sorted.map(v => <NumberCard key={v} value={v} size="xs" className="f7-land" />)}
          {busted && player.bustCard !== null && (
            <NumberCard value={player.bustCard} size="xs" bust className="f7-land" />
          )}
          {player.modifiers.map((m, i) => <ModifierChip key={`${m}-${i}`} kind={m} small />)}
          {player.hasSecondChance && <SecondChanceChip small />}
          {empty && <span className="text-[10px] text-(--text-muted)">No cards yet</span>}
        </div>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-(--text-muted)">
          {player.cumulativeScore} pts
        </span>
      </div>
    </div>
  );
}
