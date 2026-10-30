'use client';

import type { Pot } from '@/types/games/poker';
import { formatChips } from './format';

interface PotDisplayProps {
  pots: Pot[];
  potTotal: number;
}

export default function PotDisplay({ pots, potTotal }: PotDisplayProps) {
  if (potTotal <= 0) return null;

  return (
    <div className="flex flex-col items-center gap-0.5" aria-live="polite">
      {/* Re-keyed on change so the amount pops when chips go in */}
      <div
        key={potTotal}
        className="animate-poker-pop flex items-center gap-1.5 rounded-full border border-(--game-secondary)/25 bg-(--bg-primary)/60 py-0.5 pl-1 pr-2.5 text-[13px] font-semibold tabular-nums text-(--game-secondary)"
      >
        <span className="poker-chip poker-chip-lg" aria-hidden="true" />
        <span>Pot {formatChips(potTotal)}</span>
      </div>
      {pots.length > 1 && (
        <p className="text-[10px] tabular-nums text-(--text-secondary)">
          {pots.map((pot, i) => `${i === 0 ? 'Main' : `Side ${i}`} ${formatChips(pot.amount)}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
