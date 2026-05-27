'use client';

import type { NumberCard, ModifierCardKind, PlayerRoundStatus } from '@/types/games/flip7';
import { MODIFIER_CARD_LABELS, FLIP_7_CARD_COUNT } from '@/types/games/flip7';

interface CardDisplayProps {
  cards: NumberCard[];
  modifiers: ModifierCardKind[];
  secondChances: number;
  roundStatus: PlayerRoundStatus;
}

// Card colors based on rarity (low numbers = rare = warm, high = common = cool)
function getCardColor(value: number): { bg: string; text: string; border: string } {
  if (value <= 2) return { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' };      // gold/amber (rare)
  if (value <= 5) return { bg: '#ecfdf5', text: '#065f46', border: '#10b981' };      // emerald
  if (value <= 8) return { bg: '#eff6ff', text: '#1e40af', border: '#3b82f6' };      // blue
  if (value <= 10) return { bg: '#f5f3ff', text: '#5b21b6', border: '#8b5cf6' };     // purple
  return { bg: '#fdf2f8', text: '#9d174d', border: '#ec4899' };                       // pink (common, dangerous)
}

export default function CardDisplay({ cards, modifiers, secondChances, roundStatus }: CardDisplayProps) {
  if (cards.length === 0 && modifiers.length === 0 && secondChances === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-(--text-muted) animate-soft-pulse">
          {roundStatus === 'busted' ? '💀 Busted this round' : 'Waiting for cards...'}
        </p>
      </div>
    );
  }

  const totalUnique = cards.length;
  const toGo = FLIP_7_CARD_COUNT - totalUnique;
  const roundTotal = cards.reduce((sum, c) => sum + c.value, 0)
    + modifiers.reduce((sum, m) => m === 'plus2' ? sum + 2 : m === 'plus4' ? sum + 4 : sum, 0);

  // Fan layout: rotate each card slightly
  const centerIndex = (cards.length - 1) / 2;
  const rotationStep = cards.length <= 3 ? 8 : cards.length <= 5 ? 6 : cards.length <= 6 ? 5 : 4;
  const marginLeft = cards.length <= 3 ? -12 : cards.length <= 5 ? -16 : -20;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Cards in fan layout */}
      <div className="relative flex items-end justify-center min-h-[160px]" style={{ perspective: '800px' }}>
        {cards.map((card, i) => {
          const color = getCardColor(card.value);
          const rotation = (i - centerIndex) * rotationStep;
          const translateY = Math.abs(i - centerIndex) * 3;
          return (
            <div
              key={`${card.value}-${i}`}
              className="w-[60px] h-[88px] rounded-xl shadow-lg flex flex-col items-center justify-center transition-transform"
              style={{
                transform: `rotate(${rotation}deg) translateY(${translateY}px)`,
                zIndex: i,
                marginLeft: i === 0 ? 0 : marginLeft,
                backgroundColor: color.bg,
                border: `2px solid ${color.border}`,
              }}
            >
              <span className="text-[10px] font-medium absolute top-1.5 left-2" style={{ color: color.border }}>
                {card.value}
              </span>
              <span className="text-2xl font-bold" style={{ color: color.text }}>
                {card.value}
              </span>
              <span className="text-[9px] font-medium" style={{ color: color.border }}>
                pts
              </span>
              <span className="text-[10px] font-medium absolute bottom-1.5 right-2 rotate-180" style={{ color: color.border }}>
                {card.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* Modifiers + Second Chance badges */}
      {(modifiers.length > 0 || secondChances > 0) && (
        <div className="flex gap-2 flex-wrap justify-center">
          {modifiers.map((mod, i) => (
            <span
              key={`mod-${i}`}
              className="px-3 py-1 rounded-full text-xs font-bold border"
              style={{
                backgroundColor: MODIFIER_CARD_LABELS[mod].color + '15',
                color: MODIFIER_CARD_LABELS[mod].color,
                borderColor: MODIFIER_CARD_LABELS[mod].color + '40',
              }}
            >
              {MODIFIER_CARD_LABELS[mod].display}
            </span>
          ))}
          {secondChances > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/40">
              💚 Second Chance{secondChances > 1 ? ` ×${secondChances}` : ''}
            </span>
          )}
        </div>
      )}

      {/* Score subtotal + progress */}
      <div className="text-center">
        <p className="text-lg font-bold text-(--text-primary)">
          {roundTotal} pts this round
        </p>
        <p className="text-xs text-(--text-muted)">
          {totalUnique} unique · {toGo > 0 ? `${toGo} to Flip 7` : '🎉 FLIP 7!'}
        </p>
      </div>
    </div>
  );
}
