'use client';

import type { PokerHandResult } from '@/types/games/poker';
import { formatChips } from './format';

interface HandResultProps {
  result: PokerHandResult;
  myId: string | null;
  handNumber: number;
  nextHandInMs: number | null;
}

/** Center-of-table banner once a hand is decided, with a drain bar to the next deal. */
export default function HandResult({ result, myId, handNumber, nextHandInMs }: HandResultProps) {
  const winners = result.winners.slice(0, 3);
  const split = winners.length > 1;

  return (
    <div
      key={handNumber}
      className="animate-poker-banner overflow-hidden rounded-xl border border-(--game-secondary)/35 bg-(--bg-primary)/80 px-2 pb-1.5 pt-1.5 shadow-lg"
      role="status"
      aria-live="polite"
    >
      {result.uncontested ? (
        <p className="text-[12px] font-semibold leading-tight text-(--text-primary)">
          {winners[0]?.playerId === myId ? 'You take' : `${winners[0]?.playerName} takes`}{' '}
          <span className="text-(--game-secondary)">{formatChips(result.potTotal)}</span>
          <span className="mt-0.5 block text-[10px] font-normal text-(--text-secondary)">Everyone else folded</span>
        </p>
      ) : (
        <div className="space-y-0.5">
          {split && (
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-(--text-secondary)">
              {result.winners.length > 1 && new Set(result.winners.map(w => w.amount)).size === 1 ? 'Split pot' : 'Pots'}
            </p>
          )}
          {winners.map(w => (
            <p key={w.playerId} className="text-[12px] font-semibold leading-tight text-(--text-primary)">
              🏆 {w.playerId === myId ? 'You win' : `${w.playerName} wins`}{' '}
              <span className="text-(--game-secondary)">{formatChips(w.amount)}</span>
              {w.handDescription && (
                <span className="block text-[10px] font-normal text-(--text-secondary)">{w.handDescription}</span>
              )}
            </p>
          ))}
        </div>
      )}

      {nextHandInMs !== null && nextHandInMs > 0 && (
        <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-(--text-primary)/10" aria-hidden="true">
          <div
            key={`drain-${handNumber}`}
            className="poker-drain h-full bg-(--game-secondary)/70"
            style={{ animationDuration: `${nextHandInMs}ms` }}
          />
        </div>
      )}
    </div>
  );
}
