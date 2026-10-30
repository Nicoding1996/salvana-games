'use client';

import { useState } from 'react';

interface TimerBarProps {
  seconds: number;
  total: number;
}

/** Thin countdown bar. Drains smoothly between the server's once-a-second ticks. */
export default function TimerBar({ seconds, total }: TimerBarProps) {
  // A new countdown makes the value jump up. Refill instantly instead of
  // animating backwards (React's "adjust state while rendering" pattern).
  const [prev, setPrev] = useState(seconds);
  const [instant, setInstant] = useState(true);
  if (seconds !== prev) {
    setPrev(seconds);
    setInstant(seconds > prev);
  }

  const pct = total > 0 ? Math.max(0, Math.min(100, (seconds / total) * 100)) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-(--bg-elevated)"
      role="progressbar"
      aria-label="Time left"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={seconds}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          transition: instant ? 'none' : 'width 1s linear',
          background: seconds <= 5 ? 'var(--danger)' : 'var(--game-accent)',
        }}
      />
    </div>
  );
}
