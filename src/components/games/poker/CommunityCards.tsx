'use client';

import type { Card, PokerPhase } from '@/types/games/poker';
import { PlayingCard } from './PlayingCard';

interface CommunityCardsProps {
  cards: Card[];
  phase: PokerPhase;
}

export function CommunityCards({ cards }: CommunityCardsProps) {
  // Show 5 slots always, fill with cards as they're revealed
  const slots = Array.from({ length: 5 }, (_, i) => cards[i] || null);

  return (
    <div className="flex justify-center items-center gap-1.5 px-4 py-3">
      {slots.map((card, i) => (
        <div
          key={i}
          className={`
            transition-all duration-500
            ${card ? 'animate-[flipIn_0.5s_ease-out]' : ''}
          `}
          style={{ animationDelay: card ? `${i * 100}ms` : '0ms' }}
        >
          {card ? (
            <PlayingCard card={card} size="lg" />
          ) : (
            <div className="w-[52px] h-[72px] rounded-md border-2 border-dashed border-(--border-light) opacity-30" />
          )}
        </div>
      ))}
    </div>
  );
}
