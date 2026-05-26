'use client';

import type { Pot } from '@/types/games/poker';

interface PotDisplayProps {
  pots: Pot[];
}

export function PotDisplay({ pots }: PotDisplayProps) {
  const totalPot = pots.reduce((sum, p) => sum + p.amount, 0);

  if (totalPot === 0) return null;

  return (
    <div className="text-center py-1">
      <span className="text-sm font-semibold text-(--game-secondary)">
        🪙 Pot: {totalPot}
      </span>
      {pots.length > 1 && (
        <div className="flex justify-center gap-2 mt-0.5">
          {pots.map((pot, i) => (
            <span key={i} className="text-[10px] text-(--text-muted)">
              {i === 0 ? 'Main' : `Side ${i}`}: {pot.amount}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
