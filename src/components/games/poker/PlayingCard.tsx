'use client';

import type { Card } from '@/types/games/poker';
import { SUIT_SYMBOLS } from '@/types/games/poker';

interface PlayingCardProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  highlighted?: boolean;
  faceDown?: boolean;
}

const sizeClasses = {
  sm: 'w-[36px] h-[50px] text-xs',
  md: 'w-[44px] h-[62px] text-sm',
  lg: 'w-[52px] h-[72px] text-base',
};

export function PlayingCard({ card, size = 'md', highlighted = false, faceDown = false }: PlayingCardProps) {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol = SUIT_SYMBOLS[card.suit];

  if (faceDown) {
    return (
      <div className={`${sizeClasses[size]} rounded-md bg-linear-to-br from-(--game-accent) to-(--bg-elevated) border border-(--border) shadow-md flex items-center justify-center`}>
        <span className="text-lg opacity-30">♠</span>
      </div>
    );
  }

  return (
    <div
      className={`
        ${sizeClasses[size]} rounded-md bg-[#f8f6f0] border border-gray-200
        shadow-[0_2px_8px_rgba(0,0,0,0.3)] flex flex-col justify-between p-1
        relative select-none transition-all duration-300
        ${highlighted ? 'ring-2 ring-(--game-secondary) shadow-[0_0_12px_rgba(212,175,55,0.5)] -translate-y-1' : ''}
      `}
    >
      {/* Top-left rank */}
      <span className={`font-bold leading-none ${isRed ? 'text-[#f87171]' : 'text-gray-800'}`}>
        {card.rank}
      </span>

      {/* Center suit */}
      <span className={`text-center text-xl leading-none ${isRed ? 'text-[#f87171]' : 'text-gray-800'}`}>
        {suitSymbol}
      </span>

      {/* Bottom-right rank (rotated) */}
      <span className={`self-end font-bold leading-none rotate-180 ${isRed ? 'text-[#f87171]' : 'text-gray-800'}`}>
        {card.rank}
      </span>
    </div>
  );
}
