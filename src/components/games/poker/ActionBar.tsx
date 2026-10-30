'use client';

import { useState } from 'react';
import type { PokerTurnTimer } from '@/types/games/poker';
import { formatChips } from './format';

interface ActionBarProps {
  callAmount: number;      // chips needed to call (capped at your stack)
  currentBet: number;      // highest bet this street
  myBet: number;           // your chips already in this street
  myChips: number;         // your stack behind
  potTotal: number;        // everything in the middle, including this street's bets
  minRaiseTo: number;
  maxRaiseTo: number;
  canRaise: boolean;
  smallBlind: number;
  bigBlind: number;
  pending: boolean;        // action in flight: lock the buttons
  timer: PokerTurnTimer | null;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: (raiseTo: number) => void;
  onAllIn: () => void;
}

const BTN = 'flex-1 h-14 rounded-xl font-semibold text-[15px] transition-transform active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100';

export default function ActionBar({
  callAmount, currentBet, myBet, myChips, potTotal, minRaiseTo, maxRaiseTo, canRaise,
  smallBlind, bigBlind, pending, timer, onFold, onCheck, onCall, onRaise, onAllIn,
}: ActionBarProps) {
  const [raising, setRaising] = useState(false);
  const lo = Math.min(minRaiseTo, maxRaiseTo);
  const hi = maxRaiseTo;
  const [amount, setAmount] = useState(lo);

  const opening = currentBet === 0;
  const canCheck = callAmount === 0;
  const callIsAllIn = callAmount > 0 && callAmount >= myChips;
  const toCall = Math.max(0, currentBet - myBet);
  const isAllInAmount = amount >= hi;

  const snap = (value: number) => {
    if (value >= hi - smallBlind / 2) return hi;
    const snapped = Math.round(value / smallBlind) * smallBlind;
    return Math.min(hi, Math.max(lo, snapped));
  };

  // Pot-sized raise: call first, then raise by the size of the pot
  const potRaise = (fraction: number) => snap(currentBet + fraction * (potTotal + toCall));
  const presets: { label: string; value: number }[] = [];
  for (const [label, value] of [
    ['Min', lo],
    ['½ Pot', potRaise(0.5)],
    ['¾ Pot', potRaise(0.75)],
    ['Pot', potRaise(1)],
  ] as const) {
    if (value < hi && !presets.some(p => p.value === value)) presets.push({ label, value });
  }

  const submitRaise = () => {
    setRaising(false);
    if (isAllInAmount) onAllIn();
    else onRaise(amount);
  };

  const myTimer = timer && timer.total > 0 ? timer : null;
  const urgent = !!myTimer && myTimer.secondsLeft <= 5;

  return (
    <div className="px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1">
      {/* Turn clock */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-(--game-secondary)">Your turn</span>
        {myTimer && (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-(--text-primary)/10" aria-hidden="true">
              <div
                className={`h-full rounded-full ${urgent ? 'bg-(--danger)' : 'bg-(--game-secondary)'}`}
                style={{ width: `${(myTimer.secondsLeft / myTimer.total) * 100}%`, transition: 'width 1s linear' }}
              />
            </div>
            <span className={`w-8 text-right font-mono text-[13px] font-bold ${urgent ? 'animate-timer-urgent text-(--danger)' : 'text-(--text-secondary)'}`}>
              {myTimer.secondsLeft}s
            </span>
          </>
        )}
      </div>

      <div className="flex gap-2">
        {!canCheck && (
          <button type="button" className={`${BTN} border border-(--danger)/40 bg-(--bg-elevated) text-(--danger)`} onClick={onFold} disabled={pending}>
            Fold
          </button>
        )}

        {canCheck ? (
          <button type="button" className={`${BTN} border border-(--border-light) bg-(--bg-elevated) text-(--text-primary)`} onClick={onCheck} disabled={pending}>
            Check
          </button>
        ) : (
          <button
            type="button"
            className={`${BTN} ${callIsAllIn ? 'bg-(--danger) text-(--bg-primary)' : 'poker-btn-call'}`}
            onClick={onCall}
            disabled={pending}
            aria-label={callIsAllIn ? `Call all in for ${callAmount}` : `Call ${callAmount}`}
          >
            {callIsAllIn ? 'All in' : 'Call'}{' '}
            <span className="tabular-nums">{formatChips(callAmount)}</span>
          </button>
        )}

        {canRaise && (
          <button
            type="button"
            className={`${BTN} poker-btn-raise`}
            onClick={() => { setAmount(lo); setRaising(true); }}
            disabled={pending}
          >
            {opening ? 'Bet' : 'Raise'}
          </button>
        )}
      </div>

      {raising && canRaise && (
        <>
          <div className="animate-fade-in fixed inset-0 z-40 bg-(--bg-primary)/60" onClick={() => setRaising(false)} aria-hidden="true" />
          <div
            className="animate-poker-sheet fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl border-t border-(--border-light) bg-(--bg-card) px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
            role="dialog"
            aria-label={opening ? 'Choose your bet' : 'Choose your raise'}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.15em] text-(--text-muted)">{opening ? 'Bet' : 'Raise to'}</span>
              <button
                type="button"
                onClick={() => setRaising(false)}
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-(--text-muted) active:scale-90"
                aria-label="Cancel"
              >
                ✕
              </button>
            </div>

            <p className="-mt-1 text-center text-4xl font-bold tabular-nums text-(--game-secondary)">
              {formatChips(amount)}
              {isAllInAmount && <span className="ml-2 align-middle text-sm font-semibold text-(--danger)">ALL IN</span>}
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="h-11 w-11 shrink-0 rounded-xl border border-(--border-light) bg-(--bg-elevated) text-xl text-(--text-primary) active:scale-90 disabled:opacity-40"
                onClick={() => setAmount(a => snap(a - bigBlind))}
                disabled={amount <= lo}
                aria-label={`Decrease by ${bigBlind}`}
              >
                −
              </button>
              <input
                type="range"
                min={lo}
                max={hi}
                step={1}
                value={amount}
                onChange={(e) => setAmount(snap(Number(e.target.value)))}
                className="poker-range h-11 min-w-0 flex-1"
                aria-label="Amount"
              />
              <button
                type="button"
                className="h-11 w-11 shrink-0 rounded-xl border border-(--border-light) bg-(--bg-elevated) text-xl text-(--text-primary) active:scale-90 disabled:opacity-40"
                onClick={() => setAmount(a => snap(a + bigBlind))}
                disabled={amount >= hi}
                aria-label={`Increase by ${bigBlind}`}
              >
                +
              </button>
            </div>

            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {presets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setAmount(p.value)}
                  className={`h-11 rounded-lg text-[12px] font-medium transition-colors ${
                    amount === p.value
                      ? 'bg-(--game-secondary) text-(--bg-primary)'
                      : 'border border-(--border-light) bg-(--bg-elevated) text-(--text-primary)'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount(hi)}
                className={`h-11 rounded-lg text-[12px] font-semibold transition-colors ${
                  isAllInAmount ? 'bg-(--danger) text-(--bg-primary)' : 'border border-(--danger)/40 bg-(--bg-elevated) text-(--danger)'
                }`}
                style={{ gridColumnStart: 5 }}
              >
                All in
              </button>
            </div>

            <button
              type="button"
              onClick={submitRaise}
              disabled={pending}
              className={`mt-3 h-14 w-full rounded-xl text-base font-bold transition-transform active:scale-[0.97] disabled:opacity-50 ${
                isAllInAmount ? 'bg-(--danger) text-(--bg-primary)' : 'poker-btn-raise'
              }`}
            >
              {isAllInAmount ? `All in · ${formatChips(hi)}` : `${opening ? 'Bet' : 'Raise to'} ${formatChips(amount)}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
