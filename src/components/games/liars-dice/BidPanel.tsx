'use client';

import type { Bid } from '@/types/games/liars-dice';
import { countMatches, minQuantityFor } from '@/types/games/liars-dice';
import { bidOdds, oddsTone, percent } from '@/lib/games/liars-dice/odds';
import DiceIcon from './DiceIcon';

const FACES = [1, 2, 3, 4, 5, 6];

/** Start on the face you hold most of (higher face on ties), at its smallest legal quantity. */
export function defaultBid(currentBid: Bid | null, myDice: number[], wildOnes: boolean, total: number): Bid {
  let face = 6;
  let best = -1;
  for (let f = 6; f >= 1; f--) {
    if (minQuantityFor(currentBid, f) > total) continue;
    const n = countMatches(myDice, f, wildOnes);
    if (n > best) {
      best = n;
      face = f;
    }
  }
  return { faceValue: face, quantity: Math.min(total, minQuantityFor(currentBid, face)) };
}

interface BidPanelProps {
  draft: Bid;
  onDraftChange: (bid: Bid) => void;
  currentBid: Bid | null;
  totalDiceOnTable: number;
  myDice: number[];
  wildOnes: boolean;
  spotOnEnabled: boolean;
  pending: boolean;
  onPlaceBid: (quantity: number, faceValue: number) => void;
  onCallLiar: () => void;
  onCallSpotOn: () => void;
}

/**
 * Your turn: build a bid (how many × which face) and place it, or call the last one.
 * Every face shows how many you hold, and each action shows the odds from what you can see.
 */
export default function BidPanel({
  draft, onDraftChange, currentBid, totalDiceOnTable, myDice, wildOnes, spotOnEnabled, pending,
  onPlaceBid, onCallLiar, onCallSpotOn,
}: BidPanelProps) {
  const clamp = (face: number, quantity: number) =>
    Math.min(totalDiceOnTable, Math.max(minQuantityFor(currentBid, face), quantity));

  const minQty = minQuantityFor(currentBid, draft.faceValue);
  const odds = bidOdds(draft, myDice, totalDiceOnTable, wildOnes);
  const callOdds = currentBid ? bidOdds(currentBid, myDice, totalDiceOnTable, wildOnes) : null;
  const need = draft.quantity - odds.mine;

  let hint: string;
  if (need <= 0) hint = `You hold ${odds.mine} yourself, so this bid can't be wrong`;
  else if (odds.mine > 0) hint = `You hold ${odds.mine}: ${need} more needed among ${odds.hidden} hidden dice`;
  else hint = `You hold none: all ${draft.quantity} must be among the ${odds.hidden} hidden dice`;

  return (
    <section className="dice-card rounded-t-3xl px-4 pt-3 ld-safe-bottom ld-panel-in" aria-label="Your move">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-(--game-accent)">🎯 Your turn</p>
        <p className="text-[11px] text-(--text-muted)">
          {currentBid ? 'Raise the bid, or call it' : 'Open the round with any bid'}
        </p>
      </div>

      {/* How many */}
      <div className="mt-2.5 flex items-center gap-3">
        <span className="w-20 shrink-0 text-xs text-(--text-secondary)">How many?</span>
        <div className="flex flex-1 items-center justify-between rounded-2xl border border-(--border-light) bg-(--bg-primary)/50 p-1">
          <button
            type="button"
            onClick={() => onDraftChange({ ...draft, quantity: clamp(draft.faceValue, draft.quantity - 1) })}
            disabled={draft.quantity <= minQty}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--bg-elevated) text-xl font-bold text-(--text-primary) transition-transform active:scale-90 disabled:opacity-25"
            aria-label="Fewer dice"
          >
            −
          </button>
          <span key={draft.quantity} className="font-heading text-2xl font-bold tabular-nums text-(--text-primary) ld-bump" aria-live="polite">
            {draft.quantity}
          </span>
          <button
            type="button"
            onClick={() => onDraftChange({ ...draft, quantity: clamp(draft.faceValue, draft.quantity + 1) })}
            disabled={draft.quantity >= totalDiceOnTable}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--bg-elevated) text-xl font-bold text-(--text-primary) transition-transform active:scale-90 disabled:opacity-25"
            aria-label="More dice"
          >
            +
          </button>
        </div>
      </div>

      {/* Which face */}
      <div className="mt-2.5 grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Face value">
        {FACES.map(face => {
          const selected = face === draft.faceValue;
          const possible = minQuantityFor(currentBid, face) <= totalDiceOnTable;
          const held = countMatches(myDice, face, wildOnes);
          return (
            <button
              key={face}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!possible}
              onClick={() => onDraftChange({ faceValue: face, quantity: clamp(face, draft.quantity) })}
              className={`flex flex-col items-center gap-1 rounded-xl py-1.5 transition-all active:scale-95 disabled:opacity-20 ${
                selected ? 'bg-(--game-accent-dim) ring-2 ring-(--game-accent)' : 'bg-(--bg-primary)/40'
              }`}
              aria-label={`${face}s, you hold ${held}`}
            >
              <DiceIcon value={face} size={34} wild={wildOnes} highlighted={selected} />
              <span className={`text-[10px] font-semibold tabular-nums ${selected ? 'text-(--game-accent)' : 'text-(--text-muted)'}`}>
                you {held}
              </span>
            </button>
          );
        })}
      </div>

      {/* Place it */}
      <button
        type="button"
        onClick={() => onPlaceBid(draft.quantity, draft.faceValue)}
        disabled={pending}
        className="mt-3 flex h-14 w-full items-center justify-between rounded-2xl bg-(--game-accent) px-4 text-(--bg-primary) transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        <span className="flex items-center gap-2 font-heading text-lg font-bold">
          Bid {draft.quantity} ×
          <DiceIcon value={draft.faceValue} size={26} wild={wildOnes} />
        </span>
        <span className="text-xs font-semibold opacity-80">{percent(odds.atLeast)}% true</span>
      </button>

      {/* Call it */}
      {currentBid && callOdds && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onCallLiar}
            disabled={pending}
            className="ld-btn-liar flex h-14 flex-1 flex-col items-center justify-center rounded-2xl transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            <span className="font-heading text-base font-bold tracking-wide">🤥 LIAR!</span>
            <span className="text-[11px] font-semibold opacity-85">{percent(1 - callOdds.atLeast)}% it&apos;s a bluff</span>
          </button>
          {spotOnEnabled && (
            <button
              type="button"
              onClick={onCallSpotOn}
              disabled={pending}
              className="ld-btn-spot flex h-14 flex-1 flex-col items-center justify-center rounded-2xl transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              <span className="font-heading text-base font-bold tracking-wide">🎯 SPOT ON</span>
              <span className="text-[11px] font-semibold opacity-85">{percent(callOdds.exactly)}% exact</span>
            </button>
          )}
        </div>
      )}

      <p className="mt-2 text-center text-[11px]" style={{ color: oddsTone(odds.atLeast) }}>{hint}</p>
    </section>
  );
}
