'use client';

import { useEffect, useState } from 'react';

interface EndGameButtonProps {
  onConfirm: () => void;
  label?: string;
}

const RESET_MS = 3000;

/** Header "End game" button. First tap arms it, second tap within 3s confirms. */
export default function EndGameButton({ onConfirm, label = 'End game' }: EndGameButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), RESET_MS);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      className={`h-11 shrink-0 rounded-full px-3 text-[11px] font-semibold transition-colors ${
        armed ? 'bg-(--danger) text-(--bg-primary)' : 'border border-(--border) text-(--text-muted)'
      }`}
      aria-label={armed ? 'Tap again to end the game' : label}
    >
      {armed ? 'Tap again' : label}
    </button>
  );
}
