'use client';

import type { CSSProperties } from 'react';
import type { Card, Rank } from '@/types/games/poker';
import { SUIT_SYMBOLS } from '@/types/games/poker';

export type CardSize = 'xs' | 'sm' | 'md' | 'xl';

const SIZES: Record<CardSize, { box: string; rank: string; suit: string; pip: string }> = {
  xs: { box: 'w-[24px] h-[34px] rounded-[4px]', rank: 'text-[11px]', suit: 'text-[10px]', pip: '' },
  sm: { box: 'w-[30px] h-[42px] rounded-[5px]', rank: 'text-[13px]', suit: 'text-[11px]', pip: '' },
  md: { box: 'w-[40px] h-[56px] rounded-[6px]', rank: 'text-[15px]', suit: 'text-[11px]', pip: 'text-[22px]' },
  xl: { box: 'w-[64px] h-[90px] rounded-[9px]', rank: 'text-[21px]', suit: 'text-[15px]', pip: 'text-[36px]' },
};

const RANK_NAMES: Record<Rank, string> = {
  '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight',
  '9': 'Nine', '10': 'Ten', 'J': 'Jack', 'Q': 'Queen', 'K': 'King', 'A': 'Ace',
};

interface PlayingCardProps {
  card: Card | null;       // null = hidden card (back)
  size?: CardSize;
  faceDown?: boolean;
  highlight?: boolean;     // part of the winning hand
  dim?: boolean;           // not part of the winning hand
  className?: string;      // animation hooks
  style?: CSSProperties;
}

export default function PlayingCard({
  card, size = 'md', faceDown = false, highlight = false, dim = false, className = '', style,
}: PlayingCardProps) {
  const s = SIZES[size];

  if (faceDown || !card) {
    return (
      <div
        role="img"
        aria-label="Face-down card"
        className={`poker-card poker-card-back ${s.box} ${size === 'xl' ? 'text-[28px]' : 'text-[14px]'} ${className}`}
        style={style}
      />
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const symbol = SUIT_SYMBOLS[card.suit];
  const compact = size === 'xs' || size === 'sm';
  const tone = isRed ? 'text-(--poker-card-red)' : 'text-(--poker-card-black)';
  const state = `${highlight ? 'poker-card-win' : ''} ${dim ? 'poker-card-dim' : ''}`;

  return (
    <div
      role="img"
      aria-label={`${RANK_NAMES[card.rank]} of ${card.suit}`}
      className={`poker-card poker-card-face ${s.box} ${tone} ${state} ${className}`}
      style={style}
    >
      {compact ? (
        <div className="flex h-full flex-col items-center justify-center leading-none">
          <span className={`${s.rank} font-bold tracking-tighter`}>{card.rank}</span>
          <span className={`${s.suit} mt-px`}>{symbol}</span>
        </div>
      ) : (
        <>
          <div className={`absolute flex flex-col items-center leading-none ${size === 'xl' ? 'left-[5px] top-[5px]' : 'left-[3px] top-[3px]'}`}>
            <span className={`${s.rank} font-bold tracking-tighter`}>{card.rank}</span>
            <span className={`${s.suit} mt-px`}>{symbol}</span>
          </div>
          {size === 'xl' ? (
            <>
              <span className={`absolute inset-0 flex items-center justify-center ${s.pip}`}>{symbol}</span>
              <div className="absolute bottom-[5px] right-[5px] flex rotate-180 flex-col items-center leading-none">
                <span className={`${s.rank} font-bold tracking-tighter`}>{card.rank}</span>
                <span className={`${s.suit} mt-px`}>{symbol}</span>
              </div>
            </>
          ) : (
            <span className={`absolute bottom-[2px] right-[3px] leading-none ${s.pip}`}>{symbol}</span>
          )}
        </>
      )}
    </div>
  );
}
