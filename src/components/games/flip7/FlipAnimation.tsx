'use client';

import type { CSSProperties } from 'react';
import type { Flip7FlipEvent } from '@/types/games/flip7';
import {
  ACTION_CARD_LABELS,
  CHAOS_STAGGER_MS,
  FLIP_7_BONUS,
  MODIFIER_CARD_LABELS,
  chaosBatchDurationMs,
} from '@/types/games/flip7';
import Confetti from '@/components/shared/Confetti';
import { CardBack, CardFace, type CardSize } from './CardArt';

interface FlipAnimationProps {
  flips: Flip7FlipEvent[];   // one card in classic mode, everyone's cards in a chaos tick
  myId: string;
  avatars: Record<string, string>;
}

/**
 * Full-screen card reveal. The card rises face-down, turns over, then shows its
 * result (glow ring, BUST / SAVED stamp, Flip 7 burst). Purely visual: the
 * overlay never blocks taps, and the hook unmounts it when its time is up.
 */
export default function FlipAnimation({ flips, myId, avatars }: FlipAnimationProps) {
  if (flips.length === 0) return null;
  const totalMs = chaosBatchDurationMs(flips);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none f7-reveal-out"
      style={{ animationDelay: `${Math.max(0, totalMs - 240)}ms` }}
      aria-live="polite"
    >
      <div className="f7-reveal-backdrop" />
      {flips.some(f => f.flipSeven) && <Confetti />}
      {flips.length === 1
        ? <SingleReveal flip={flips[0]} myId={myId} avatar={avatars[flips[0].playerId] ?? ''} />
        : <BatchReveal flips={flips} myId={myId} avatars={avatars} />}
    </div>
  );
}

function RevealCard({ flip, size, delayMs = 0 }: { flip: Flip7FlipEvent; size: CardSize; delayMs?: number }) {
  const big = size === 'lg';
  const ring = flip.flipSeven
    ? 'f7-ring-seven'
    : flip.result === 'bust'
      ? 'f7-ring-bust'
      : flip.result === 'secondChance'
        ? 'f7-ring-second'
        : 'f7-ring-safe';
  const style = { '--f7-delay': `${delayMs}ms` } as CSSProperties;

  return (
    <div className={flip.result === 'bust' ? 'f7-shake' : ''} style={style}>
      <div className="f7-flip-stage">
        <div className={`f7-ring ${ring}${big ? '' : ' f7-ring-tight'}`} />
        <div className="f7-flip3d">
          <CardFace card={flip.card} size={size} className="f7-face" />
          <CardBack size={size} className="f7-back" />
        </div>
        {flip.result === 'bust' && <span className={`f7-stamp${big ? '' : ' f7-stamp-sm'}`}>BUST</span>}
        {flip.result === 'secondChance' && (
          <span className={`f7-stamp f7-stamp-saved${big ? '' : ' f7-stamp-sm'}`}>SAVED</span>
        )}
      </div>
    </div>
  );
}

/** Headline + detail line describing what a flipped card did. */
function describe(flip: Flip7FlipEvent, isMe: boolean): { text: string; detail: string | null; tone: string } {
  const who = isMe ? 'you' : flip.playerName;
  const { card } = flip;

  if (flip.flipSeven) {
    return {
      text: isMe ? `+${FLIP_7_BONUS} bonus · round over!` : `${flip.playerName} collected 7 numbers`,
      detail: isMe ? '7 unique numbers' : `+${FLIP_7_BONUS} bonus · round over`,
      tone: 'var(--game-accent)',
    };
  }
  if (flip.result === 'bust') {
    return {
      text: isMe ? 'Bust!' : `${flip.playerName} busts!`,
      detail: card.type === 'number' ? `Already had a ${card.value}` : null,
      tone: 'var(--danger)',
    };
  }
  if (flip.result === 'secondChance') {
    return {
      text: `Second Chance saves ${who}`,
      detail: card.type === 'number' ? `Duplicate ${card.value} discarded` : null,
      tone: 'var(--f7-second)',
    };
  }
  if (card.type === 'number') {
    return { text: `+${card.value}`, detail: null, tone: 'var(--text-primary)' };
  }
  if (card.type === 'modifier') {
    const info = MODIFIER_CARD_LABELS[card.kind];
    return { text: `${info.name} bonus`, detail: info.hint, tone: info.color };
  }
  const info = ACTION_CARD_LABELS[card.kind];
  if (card.kind === 'secondChance') {
    return { text: isMe ? 'You got a Second Chance' : `${flip.playerName} got a Second Chance`, detail: info.hint, tone: info.color };
  }
  return {
    text: isMe ? `${info.name}! Pick a target` : `${info.name}! ${flip.playerName} picks a target`,
    detail: info.hint,
    tone: info.color,
  };
}

function SingleReveal({ flip, myId, avatar }: { flip: Flip7FlipEvent; myId: string; avatar: string }) {
  const isMe = flip.playerId === myId;
  const { text, detail, tone } = describe(flip, isMe);

  return (
    <div className="relative flex flex-col items-center px-6">
      <p className="mb-5 text-sm font-semibold text-(--text-secondary)">
        <span aria-hidden="true">{avatar}</span> {isMe ? 'You flip…' : `${flip.playerName} flips…`}
      </p>
      <RevealCard flip={flip} size="lg" />
      <div className="mt-6 text-center f7-caption">
        {flip.flipSeven && <p className="f7-seven-burst">FLIP 7!</p>}
        <p className="text-lg font-bold" style={{ color: tone }}>{text}</p>
        {detail && <p className="mt-0.5 text-xs text-(--text-secondary)">{detail}</p>}
      </div>
    </div>
  );
}

function batchLabel(flip: Flip7FlipEvent): { text: string; tone: string } {
  if (flip.flipSeven) return { text: 'FLIP 7!', tone: 'var(--game-accent)' };
  if (flip.result === 'bust') return { text: 'BUST', tone: 'var(--danger)' };
  if (flip.result === 'secondChance') return { text: 'SAVED', tone: 'var(--f7-second)' };
  const { card } = flip;
  if (card.type === 'number') return { text: `+${card.value}`, tone: 'var(--text-primary)' };
  if (card.type === 'modifier') {
    const info = MODIFIER_CARD_LABELS[card.kind];
    return { text: info.display, tone: info.color };
  }
  const info = ACTION_CARD_LABELS[card.kind];
  return { text: info.name, tone: info.color };
}

function BatchReveal({ flips, myId, avatars }: { flips: Flip7FlipEvent[]; myId: string; avatars: Record<string, string> }) {
  const size: CardSize = flips.length > 4 ? 'sm' : 'md';
  return (
    <div className="relative w-full max-w-sm px-4">
      <p className="mb-5 text-center text-sm font-semibold text-(--text-secondary)">⚡ Everyone flips at once</p>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-4">
        {flips.map((f, i) => {
          const delay = i * CHAOS_STAGGER_MS;
          const label = batchLabel(f);
          const labelStyle = { '--f7-delay': `${delay}ms` } as CSSProperties;
          return (
            <div key={f.playerId} className="flex w-[76px] flex-col items-center">
              <RevealCard flip={f} size={size} delayMs={delay} />
              <p className="mt-2 max-w-full truncate text-[11px] font-semibold text-(--text-secondary) f7-caption" style={labelStyle}>
                <span aria-hidden="true">{avatars[f.playerId] ?? ''}</span> {f.playerId === myId ? 'You' : f.playerName}
              </p>
              <p className="text-[11px] font-bold f7-caption" style={{ ...labelStyle, color: label.tone }}>{label.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
