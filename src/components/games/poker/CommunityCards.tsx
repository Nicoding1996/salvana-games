'use client';

import type { Card } from '@/types/games/poker';
import { sameCard } from '@/types/games/poker';
import PlayingCard from './PlayingCard';

interface CommunityCardsProps {
  cards: Card[];
  handNumber: number;
  winningCards: Card[] | null;   // at showdown: light up the winning five, dim the rest
}

export default function CommunityCards({ cards, handNumber, winningCards }: CommunityCardsProps) {
  return (
    <div className="flex items-center justify-center gap-[5px]" aria-label={`Board: ${cards.length} of 5 cards`}>
      {Array.from({ length: 5 }, (_, i) => {
        const card = cards[i];
        if (!card) {
          return <div key={`${handNumber}-${i}-slot`} className="poker-slot h-[56px] w-[40px]" aria-hidden="true" />;
        }
        const inWinningHand = winningCards ? winningCards.some(c => sameCard(c, card)) : false;
        return (
          <PlayingCard
            key={`${handNumber}-${i}`}
            card={card}
            size="md"
            highlight={!!winningCards && inWinningHand}
            dim={!!winningCards && !inWinningHand}
            className="animate-poker-flip-in"
            // The flop turns over one card at a time; turn and river flip alone
            style={{ animationDelay: `${i < 3 ? i * 120 : 0}ms` }}
          />
        );
      })}
    </div>
  );
}
