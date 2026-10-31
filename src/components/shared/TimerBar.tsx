'use client';

import { useState } from 'react';

interface TimerBarProps {
  seconds: number;
  total: number;
  /** At or below this many seconds the bar turns red */
  urgentAt?: number;
}

/** Thin countdown bar. Drains smoothly between the server's once-a-second ticks. */
export default function TimerBar({ seconds, total, urgentAt = 5 }: TimerBarProps) {
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
      {/* Slides out instead of shrinking: a transform transition runs on the GPU,
          a width transition re-lays out and repaints on every frame */}
      <div
        className="h-full w-full rounded-full"
        style={{
          transform: `translateX(${pct - 100}%)`,
          transition: instant ? 'none' : 'transform 1s linear',
          background: seconds <= urgentAt ? 'var(--danger)' : 'var(--game-accent)',
        }}
      />
    </div>
  );
}
