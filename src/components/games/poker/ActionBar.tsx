'use client';

import { useState } from 'react';

interface ActionBarProps {
  callAmount: number;
  minRaise: number;       // minimum "raise to" amount
  currentBet: number;     // highest bet this round
  myChips: number;        // player's remaining chips
  potTotal: number;       // total pot amount
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onRaise: (amount: number) => void;
  onAllIn: () => void;
  turnTimer: number | null;
}

export function ActionBar({
  callAmount, minRaise, currentBet, myChips, potTotal,
  onFold, onCheck, onCall, onRaise, onAllIn, turnTimer,
}: ActionBarProps) {
  const [showRaisePanel, setShowRaisePanel] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const canCheck = callAmount === 0;
  const totalChips = myChips + (currentBet > 0 ? 0 : 0); // chips available
  const maxRaise = myChips + currentBet; // max "raise to" (all your chips)
  const canRaise = myChips > callAmount && minRaise <= maxRaise;

  // Preset "raise to" amounts based on pot
  const presets: { label: string; amount: number }[] = [];

  // Min raise
  if (minRaise <= maxRaise) {
    presets.push({ label: `Min (${minRaise})`, amount: minRaise });
  }

  // Half pot raise: raise to currentBet + half the pot
  const halfPotRaise = currentBet + Math.floor(potTotal / 2);
  if (halfPotRaise > minRaise && halfPotRaise < maxRaise) {
    presets.push({ label: `½ Pot (${halfPotRaise})`, amount: halfPotRaise });
  }

  // Pot-sized raise: raise to currentBet + pot
  const potRaise = currentBet + potTotal;
  if (potRaise > minRaise && potRaise < maxRaise && potRaise !== halfPotRaise) {
    presets.push({ label: `Pot (${potRaise})`, amount: potRaise });
  }

  const handleRaise = (amount: number) => {
    onRaise(amount);
    setShowRaisePanel(false);
    setCustomAmount('');
  };

  const handleCustomRaise = () => {
    const amount = parseInt(customAmount, 10);
    if (!isNaN(amount) && amount >= minRaise && amount <= maxRaise) {
      handleRaise(amount);
    }
  };

  return (
    <div className="px-4 pb-4 pt-2 space-y-2">
      {/* Timer */}
      {turnTimer !== null && (
        <div className="text-center">
          <span className={`text-sm font-mono ${turnTimer <= 10 ? 'text-(--danger) animate-pulse' : 'text-(--text-secondary)'}`}>
            {turnTimer}s
          </span>
        </div>
      )}

      {/* Raise panel */}
      {showRaisePanel && canRaise && (
        <div className="space-y-2">
          {/* Presets */}
          <div className="flex gap-1.5 justify-center flex-wrap">
            {presets.map(({ label, amount }) => (
              <button
                key={amount}
                onClick={() => handleRaise(amount)}
                className="px-3 py-2 rounded-lg bg-(--bg-elevated) text-(--text-primary) text-xs border border-(--border) active:scale-95 transition-transform"
              >
                {label}
              </button>
            ))}
            <button
              onClick={onAllIn}
              className="px-3 py-2 rounded-lg bg-(--danger) text-white text-xs font-bold active:scale-95 transition-transform"
            >
              All In ({maxRaise})
            </button>
          </div>

          {/* Custom amount input */}
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder={`${minRaise}–${maxRaise}`}
              min={minRaise}
              max={maxRaise}
              className="flex-1 py-2 px-3 bg-(--bg-card) border border-(--border) rounded-lg text-sm text-(--text-primary) outline-none focus:border-(--game-accent)"
              inputMode="numeric"
            />
            <button
              onClick={handleCustomRaise}
              disabled={!customAmount || parseInt(customAmount) < minRaise || parseInt(customAmount) > maxRaise}
              className="px-4 py-2 rounded-lg bg-(--game-accent) text-white text-sm font-semibold disabled:opacity-40 active:scale-95 transition-transform"
            >
              Raise
            </button>
          </div>
        </div>
      )}

      {/* Main action buttons */}
      <div className="flex gap-2">
        {/* Fold */}
        <button
          onClick={onFold}
          className="flex-1 py-3.5 rounded-xl bg-(--bg-elevated) border border-(--danger)/30 text-(--danger) font-semibold text-base active:scale-95 transition-transform"
          aria-label="Fold"
        >
          Fold
        </button>

        {/* Check or Call */}
        {canCheck ? (
          <button
            onClick={onCheck}
            className="flex-1 py-3.5 rounded-xl bg-(--bg-elevated) border border-(--border-light) text-(--text-primary) font-semibold text-base active:scale-95 transition-transform"
            aria-label="Check"
          >
            Check
          </button>
        ) : (
          <button
            onClick={onCall}
            className="flex-1 py-3.5 rounded-xl bg-(--bg-elevated) border border-(--border-light) text-(--text-primary) font-semibold text-base active:scale-95 transition-transform"
            aria-label={`Call ${callAmount}`}
          >
            Call {callAmount}
          </button>
        )}

        {/* Raise */}
        {canRaise && (
          <button
            onClick={() => setShowRaisePanel(!showRaisePanel)}
            className="flex-1 py-3.5 rounded-xl bg-(--game-accent) text-white font-semibold text-base active:scale-95 transition-transform"
            aria-label="Raise"
          >
            Raise
          </button>
        )}
      </div>
    </div>
  );
}
