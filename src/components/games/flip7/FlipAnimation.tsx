'use client';

import type { Card } from '@/types/games/flip7';
import { ACTION_CARD_LABELS, MODIFIER_CARD_LABELS } from '@/types/games/flip7';

interface FlipAnimationProps {
  card: Card;
  result: 'safe' | 'bust' | 'secondChance';
  playerName: string;
  isMe: boolean;
}

// Match the card colors from CardDisplay
function getCardColor(value: number): { bg: string; text: string; border: string } {
  if (value <= 2) return { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' };
  if (value <= 5) return { bg: '#ecfdf5', text: '#065f46', border: '#10b981' };
  if (value <= 8) return { bg: '#eff6ff', text: '#1e40af', border: '#3b82f6' };
  if (value <= 10) return { bg: '#f5f3ff', text: '#5b21b6', border: '#8b5cf6' };
  return { bg: '#fdf2f8', text: '#9d174d', border: '#ec4899' };
}

export default function FlipAnimation({ card, result, playerName, isMe }: FlipAnimationProps) {
  const getCardDisplay = () => {
    if (card.type === 'number') {
      const color = getCardColor(card.value);
      return (
        <div
          className="w-20 h-28 rounded-xl flex flex-col items-center justify-center shadow-2xl"
          style={{ backgroundColor: color.bg, border: `2.5px solid ${color.border}` }}
        >
          <span className="text-3xl font-bold" style={{ color: color.text }}>{card.value}</span>
          <span className="text-[10px] font-medium" style={{ color: color.border }}>pts</span>
        </div>
      );
    }
    if (card.type === 'action') {
      const label = ACTION_CARD_LABELS[card.kind];
      return (
        <div className="w-20 h-28 rounded-xl flex flex-col items-center justify-center shadow-2xl bg-(--bg-elevated) border-2" style={{ borderColor: label.color }}>
          <span className="text-2xl">{label.icon}</span>
          <p className="text-[10px] font-bold mt-1" style={{ color: label.color }}>{label.name}</p>
        </div>
      );
    }
    if (card.type === 'modifier') {
      const label = MODIFIER_CARD_LABELS[card.kind];
      return (
        <div className="w-20 h-28 rounded-xl flex flex-col items-center justify-center shadow-2xl bg-(--bg-elevated) border-2" style={{ borderColor: label.color }}>
          <span className="text-2xl font-bold" style={{ color: label.color }}>{label.display}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className={`animate-flip-in ${result === 'bust' ? 'animate-bust-shake' : ''}`}>
        {getCardDisplay()}
        {/* Result label */}
        <div className="text-center mt-3">
          {result === 'bust' && (
            <p className="text-sm font-bold text-(--danger)">
              {isMe ? '💀 BUST!' : `💀 ${playerName} busted!`}
            </p>
          )}
          {result === 'secondChance' && (
            <p className="text-sm font-bold text-green-400">
              💚 Second Chance!
            </p>
          )}
          {result === 'safe' && !isMe && (
            <p className="text-xs text-(--text-muted)">{playerName}</p>
          )}
        </div>
      </div>
    </div>
  );
}
