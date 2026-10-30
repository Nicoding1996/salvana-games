'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import type { CellState, Coordinate, SonarScan } from '@/types/games/battleship';
import { GRID_LABELS_COL, SHIP_COLOR_VARS, cellName } from '@/types/games/battleship';
import GridCell, { type CellImpact } from './GridCell';

// ---- Board sizing from the viewport (phones first, capped for tablets) ----

const MAX_WIDTH = 512;

function subscribeResize(cb: () => void): () => void {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

export function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => Math.min(window.innerWidth, MAX_WIDTH),
    () => 375,
  );
}

const GAP = 2;
const PADDING = 4;
const LABEL = 14;

/** Largest square cell that fits `width` pixels (board padding, gaps and row labels included). */
export function fitCellSize(width: number, gridSize: number, labels: boolean): number {
  const usable = width - PADDING * 2 - GAP * gridSize - (labels ? LABEL : 0);
  return Math.max(8, Math.floor(usable / gridSize));
}

const STATE_WORDS: Record<CellState, string> = {
  empty: 'open water',
  ship: 'your ship',
  hit: 'hit',
  miss: 'miss',
  sunk: 'sunk ship',
};

interface BoardProps {
  grid: CellState[][];
  cellSize: number;
  ariaLabel: string;
  labels?: boolean;
  shipMap?: (string | null)[][];          // own fleet: color the segments
  live?: boolean;                         // you're firing at this board
  sonarMode?: boolean;
  canTap?: (row: number, col: number) => boolean;
  onTap?: (row: number, col: number) => void;
  pending?: Coordinate | null;
  impact?: (CellImpact & Coordinate) | null;
  scan?: SonarScan | null;
  selectedShipId?: string | null;
}

export default function Board({
  grid, cellSize, ariaLabel, labels = false, shipMap, live = false, sonarMode = false,
  canTap, onTap, pending, impact, scan, selectedShipId,
}: BoardProps) {
  const n = grid.length;
  // Where cell (0,0) starts inside the board (padding, plus the label row/column)
  const origin = PADDING + (labels ? LABEL + GAP : 0);
  const columns = `${labels ? `${LABEL}px ` : ''}repeat(${n}, ${cellSize}px)`;
  const join = Math.ceil(GAP / 2) + 0.5;

  // Ship segments reach into the gap toward the next segment of the same ship, so ships read as one piece
  const segmentStyle = (r: number, c: number, id: string): CSSProperties => {
    const same = (rr: number, cc: number) => shipMap?.[rr]?.[cc] === id;
    const t = same(r - 1, c);
    const b = same(r + 1, c);
    const l = same(r, c - 1);
    const rt = same(r, c + 1);
    const inset = '10%';
    const round = '42%';
    return {
      top: t ? -join : inset,
      bottom: b ? -join : inset,
      left: l ? -join : inset,
      right: rt ? -join : inset,
      borderTopLeftRadius: t || l ? 2 : round,
      borderTopRightRadius: t || rt ? 2 : round,
      borderBottomLeftRadius: b || l ? 2 : round,
      borderBottomRightRadius: b || rt ? 2 : round,
    };
  };

  return (
    <div
      className={`bs-board w-fit ${live ? 'bs-board-live' : ''} ${sonarMode ? 'bs-board-sonar' : ''}`}
      style={{ gridTemplateColumns: columns }}
      role="group"
      aria-label={ariaLabel}
    >
      {labels && (
        <>
          <span aria-hidden="true" />
          {Array.from({ length: n }, (_, c) => (
            <span key={`c${c}`} className="bs-label" style={{ height: LABEL }} aria-hidden="true">{GRID_LABELS_COL[c]}</span>
          ))}
        </>
      )}
      {grid.map((row, r) => (
        <div key={r} className="contents">
          {labels && <span className="bs-label" aria-hidden="true">{r + 1}</span>}
          {row.map((cell, c) => {
            const shipId = shipMap?.[r]?.[c] ?? null;
            const tappable = !!onTap && (canTap ? canTap(r, c) : true);
            return (
              <GridCell
                key={c}
                state={cell}
                row={r}
                col={c}
                size={cellSize}
                label={`${cellName({ row: r, col: c })}, ${STATE_WORDS[cell]}`}
                shipColor={shipId ? SHIP_COLOR_VARS[shipId] : undefined}
                segmentStyle={shipId ? segmentStyle(r, c, shipId) : undefined}
                selected={!!shipId && shipId === selectedShipId}
                pending={!!pending && pending.row === r && pending.col === c}
                impact={impact && impact.row === r && impact.col === c ? impact : null}
                sonarAim={sonarMode && tappable}
                onTap={tappable ? onTap : undefined}
              />
            );
          })}
        </div>
      ))}
      {scan && (
        <span
          className={`bs-scan absolute ${scan.hasShip ? 'bs-scan-yes' : 'bs-scan-no'}`}
          style={{
            left: origin + scan.topLeft.col * (cellSize + GAP),
            top: origin + scan.topLeft.row * (cellSize + GAP),
            width: cellSize * 2 + GAP,
            height: cellSize * 2 + GAP,
          }}
          aria-hidden="true"
        >
          <span className="bs-scan-badge" style={scan.hasShip ? undefined : { background: 'var(--bg-elevated)', color: 'var(--bs-sonar)' }}>
            {scan.hasShip ? '!' : '✓'}
          </span>
        </span>
      )}
    </div>
  );
}
