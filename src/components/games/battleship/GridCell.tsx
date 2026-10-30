'use client';

import type { CSSProperties } from 'react';
import type { CellState, ShotResult } from '@/types/games/battleship';

export interface CellImpact {
  key: number;
  result: ShotResult;
}

interface GridCellProps {
  state: CellState;
  row: number;
  col: number;
  size: number;
  label: string;                 // accessible name, e.g. "B4, open water"
  shipColor?: string;            // own ship segment color (CSS value)
  segmentStyle?: CSSProperties;  // insets / corners that join a ship's segments together
  selected?: boolean;            // placement: the ship being moved
  pending?: boolean;             // a shot here is on its way to the server
  impact?: CellImpact | null;    // the newest shot landed here
  sonarAim?: boolean;            // sonar mode: tapping scans from here
  onTap?: (row: number, col: number) => void;  // undefined = not tappable
}

export default function GridCell({
  state, row, col, size, label, shipColor, segmentStyle, selected, pending, impact, sonarAim, onTap,
}: GridCellProps) {
  const hasSegment = !!shipColor && (state === 'ship' || state === 'hit' || state === 'sunk');
  const classes = [
    'bs-cell',
    state === 'hit' && !hasSegment ? 'bs-cell-hit' : '',
    state === 'sunk' && !hasSegment ? 'bs-cell-sunk' : '',
    sonarAim ? 'bs-cell-sonar-aim' : '',
    impact ? 'animate-cell-impact' : '',
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {hasSegment && (
        <span
          className={`bs-seg ${selected ? 'bs-seg-selected' : ''} ${state === 'hit' ? 'bs-seg-hit' : ''} ${state === 'sunk' ? 'bs-seg-sunk animate-ship-sink' : ''}`}
          style={{ '--ship': shipColor, ...segmentStyle } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {state === 'miss' && <span className="bs-miss-dot" aria-hidden="true" />}
      {state === 'hit' && <span className="bs-fire animate-fire-flicker" aria-hidden="true" />}
      {state === 'sunk' && (
        <svg viewBox="0 0 20 20" className="bs-x" aria-hidden="true">
          <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      )}
      {pending && <span className="bs-reticle" aria-hidden="true" />}
      {impact && (
        <span
          key={impact.key}
          className={impact.result === 'miss' ? 'bs-fx-ring animate-splash' : 'bs-fx-boom animate-explosion'}
          aria-hidden="true"
        />
      )}
    </>
  );

  const style = { width: size, height: size };
  if (onTap) {
    return (
      <button type="button" className={classes} style={style} onClick={() => onTap(row, col)} aria-label={label}>
        {content}
      </button>
    );
  }
  return (
    <div className={classes} style={style} aria-hidden="true">
      {content}
    </div>
  );
}
