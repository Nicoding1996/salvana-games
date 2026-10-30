'use client';

import type { CSSProperties } from 'react';
import type { Card, ModifierCardKind } from '@/types/games/flip7';
import { ACTION_CARD_LABELS, FLIP_7_CARD_COUNT, MODIFIER_CARD_LABELS } from '@/types/games/flip7';

// Card art primitives. All colors come from the --f7-* custom properties
// defined under [data-game="flip-7"] in globals.css.

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

/** Ink color (a CSS custom property) for a number card value. */
export function numberInk(value: number): string {
  const v = Math.min(12, Math.max(0, Math.round(value)));
  return `var(--f7-n${v})`;
}

function withInk(ink: string, style?: CSSProperties): CSSProperties {
  return { '--f7-ink': ink, ...style } as CSSProperties;
}

interface CardProps {
  size?: CardSize;
  className?: string;
  style?: CSSProperties;
}

export function NumberCard({
  value, bust = false, size = 'md', className = '', style,
}: CardProps & { value: number; bust?: boolean }) {
  const corners = size === 'md' || size === 'lg';
  return (
    <div
      role="img"
      aria-label={bust ? `Duplicate ${value}, bust` : `${value}`}
      className={`f7-card f7-card-${size}${bust ? ' f7-card-bust' : ''} ${className}`}
      style={withInk(bust ? 'var(--f7-bust-ink)' : numberInk(value), style)}
    >
      {corners && <span className="f7-idx" aria-hidden="true">{value}</span>}
      <span aria-hidden="true">{value}</span>
      {corners && <span className="f7-idx f7-idx-br" aria-hidden="true">{value}</span>}
    </div>
  );
}

/** Any card face: numbers, actions (Freeze, Flip Three, Second Chance) and modifiers. */
export function CardFace({ card, size = 'md', className = '', style }: CardProps & { card: Card }) {
  if (card.type === 'number') {
    return <NumberCard value={card.value} size={size} className={className} style={style} />;
  }
  const info = card.type === 'action' ? ACTION_CARD_LABELS[card.kind] : MODIFIER_CARD_LABELS[card.kind];
  const glyph = card.type === 'action' ? ACTION_CARD_LABELS[card.kind].icon : MODIFIER_CARD_LABELS[card.kind].display;
  return (
    <div
      role="img"
      aria-label={info.name}
      className={`f7-card f7-card-special f7-card-${size} ${className}`}
      style={withInk(info.color, style)}
    >
      <span className={card.type === 'action' ? 'f7-glyph' : ''} aria-hidden="true">{glyph}</span>
      {size === 'lg' && <span className="f7-special-name" aria-hidden="true">{info.name}</span>}
    </div>
  );
}

export function CardBack({ size = 'md', className = '', style }: CardProps) {
  return <div aria-hidden="true" className={`f7-card f7-card-back f7-card-${size} ${className}`} style={style} />;
}

export function ModifierChip({ kind, small = false }: { kind: ModifierCardKind; small?: boolean }) {
  const info = MODIFIER_CARD_LABELS[kind];
  return (
    <span
      className={`f7-chip${small ? ' f7-chip-sm' : ''}`}
      style={withInk(info.color)}
      title={info.hint}
      aria-label={`${info.name} modifier`}
    >
      {info.display}
    </span>
  );
}

export function SecondChanceChip({ count = 1, small = false }: { count?: number; small?: boolean }) {
  return (
    <span
      className={`f7-chip${small ? ' f7-chip-sm' : ''}`}
      style={withInk('var(--f7-second)')}
      title={ACTION_CARD_LABELS.secondChance.hint}
      aria-label={count > 1 ? `${count} Second Chances` : 'Second Chance'}
    >
      💚{count > 1 ? `×${count}` : ''}
    </span>
  );
}

/** Seven pips showing how many unique numbers a hand has. Pulses at 6 of 7. */
export function FlipPips({ count }: { count: number }) {
  const filled = Math.min(count, FLIP_7_CARD_COUNT);
  return (
    <span
      role="img"
      aria-label={`${filled} of ${FLIP_7_CARD_COUNT} unique numbers`}
      className={`f7-pips${filled === FLIP_7_CARD_COUNT - 1 ? ' f7-pips-hot' : ''}`}
    >
      {Array.from({ length: FLIP_7_CARD_COUNT }, (_, i) => (
        <span key={i} className={`f7-pip${i < filled ? ' f7-pip-on' : ''}`} />
      ))}
    </span>
  );
}

/** Small stacked draw pile with the number of cards left. */
export function DeckPile({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`${count} cards left in the deck`}>
      <div className="relative w-[25px] h-[33px]" aria-hidden="true">
        <CardBack size="xs" className="absolute left-[3px] top-0" />
        <CardBack size="xs" className="absolute left-[1.5px] top-[1.5px]" />
        <CardBack size="xs" className="absolute left-0 top-[3px]" />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-(--text-secondary)">{count}</span>
    </div>
  );
}
