'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card, HandEvaluation } from '@/types/games/poker';
import { sameCard } from '@/types/games/poker';
import PlayingCard from './PlayingCard';

interface HoleCardsProps {
  cards: Card[];
  hand: HandEvaluation | null;
  handNumber: number;
  shown: boolean;                       // face-up mode (kept across hands)
  onShownChange: (shown: boolean) => void;
  folded: boolean;
  winningCards: Card[] | null;          // highlight your cards that won at showdown
}

const HOLD_MS = 180;

/** Strength tint for the live hand label */
function strengthClass(rankIndex: number): string {
  if (rankIndex >= 6) return 'text-(--danger)';          // full house or better
  if (rankIndex >= 4) return 'text-(--game-secondary)';  // straight / flush
  if (rankIndex >= 1) return 'text-(--text-primary)';    // pair+
  return 'text-(--text-secondary)';
}

/**
 * Your two cards. Face-down by default so neighbours can't see your screen:
 * tap to flip them (stays that way next hand too), or press and hold to peek.
 */
export default function HoleCards({ cards, hand, handNumber, shown, onShownChange, folded, winningCards }: HoleCardsProps) {
  const [peeking, setPeeking] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  if (cards.length === 0) return null;

  const visible = shown || peeking;

  const startPress = () => {
    held.current = false;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setPeeking(true);
    }, HOLD_MS);
  };

  /** Ends a press; returns true if it was a hold (peek) rather than a tap. */
  const endPress = (): boolean => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    const wasHold = held.current;
    held.current = false;
    if (wasHold) setPeeking(false);
    return wasHold;
  };

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        className="relative flex touch-manipulation select-none items-end pl-1 pr-2 [-webkit-touch-callout:none]"
        aria-pressed={shown}
        aria-label={shown ? 'Hide your cards' : 'Show your cards'}
        onPointerDown={startPress}
        onPointerUp={() => { if (!endPress()) onShownChange(!shown); }}
        onPointerLeave={() => { endPress(); }}
        onPointerCancel={() => { endPress(); }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onShownChange(!shown);
          }
        }}
      >
        {cards.map((card, i) => {
          const won = winningCards ? winningCards.some(c => sameCard(c, card)) : false;
          return (
            <div
              key={`${handNumber}-${i}`}
              className={`${i === 0 ? '-rotate-6' : '-ml-5 mb-1 rotate-6'} ${folded ? 'opacity-40 grayscale' : ''} transition-opacity`}
            >
              <PlayingCard
                card={card}
                size="xl"
                faceDown={!visible}
                highlight={won && visible}
                className="animate-poker-deal"
                style={{ animationDelay: `${i * 140}ms` }}
              />
            </div>
          );
        })}
      </button>

      <p className={`mt-1 h-4 text-[11px] font-semibold leading-4 ${visible && hand ? strengthClass(hand.rankIndex) : 'text-(--text-muted)'}`}>
        {folded
          ? 'Folded'
          : visible
            ? hand?.description ?? ''
            : 'Tap to flip · hold to peek'}
      </p>
    </div>
  );
}
