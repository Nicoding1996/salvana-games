'use client';

import { useState } from 'react';
import type {
  BattleshipClientState,
  BattleshipTimer,
  CellState,
  Direction,
  ShipPlacement as Placement,
} from '@/types/games/battleship';
import { SHIPS, SHIP_COLOR_VARS, fitsOnBoard, randomFleet, shipCells } from '@/types/games/battleship';
import TimerBar from '@/components/shared/TimerBar';
import Board, { fitCellSize, useViewportWidth } from './Board';

interface ShipPlacementProps {
  state: BattleshipClientState;
  myId: string;
  timer: BattleshipTimer | null;
  sending: boolean;
  onDeploy: (placements: Placement[]) => void;
}

const sizeOf = (shipId: string) => SHIPS.find(s => s.id === shipId)?.size ?? 0;

/** Slide a ship back onto the board if it hangs over the edge. */
function fitStart(shipId: string, row: number, col: number, direction: Direction, gridSize: number) {
  const size = sizeOf(shipId);
  return direction === 'horizontal'
    ? { row, col: Math.min(col, gridSize - size) }
    : { row: Math.min(row, gridSize - size), col };
}

function ReadyScreen({ state, myId, timer }: { state: BattleshipClientState; myId: string; timer: BattleshipTimer | null }) {
  const width = useViewportWidth();
  const cell = fitCellSize(Math.min(width - 96, 260), state.gridSize, false);
  const waiting = state.players.filter(p => !p.ready && p.connected).map(p => p.name);
  return (
    <div className="flex flex-1 flex-col items-center px-5 pb-6 pt-4 text-center animate-fade-in">
      <p className="text-4xl" aria-hidden="true">⚓</p>
      <h2 className="mt-2 text-lg font-bold text-(--text-primary)">Fleet deployed</h2>
      <p className="mt-0.5 text-sm text-(--text-secondary)">
        {waiting.length > 0 ? `Waiting for ${waiting.join(', ')}…` : 'Battle stations…'}
      </p>

      {state.inGame && (
        <div className="mt-5">
          <Board grid={state.myGrid} shipMap={state.myShipMap} cellSize={cell} ariaLabel="Your fleet" />
        </div>
      )}

      <ul className="mt-5 w-full max-w-xs space-y-1.5" aria-label="Who is ready">
        {state.players.map(p => (
          <li key={p.id} className="flex items-center gap-2 rounded-xl border border-(--border) bg-(--bg-card) px-3 py-2 text-sm">
            <span aria-hidden="true">{p.avatar}</span>
            <span className="min-w-0 flex-1 truncate text-left text-(--text-primary)">{p.id === myId ? 'You' : p.name}</span>
            <span className={`text-xs font-semibold ${p.ready ? 'text-(--success)' : p.connected ? 'text-(--text-muted) animate-soft-pulse' : 'text-(--danger)'}`}>
              {p.ready ? '✓ Ready' : p.connected ? 'Placing…' : 'Away'}
            </span>
          </li>
        ))}
      </ul>

      {timer && timer.playerId === null && (
        <div className="mt-5 w-full max-w-xs">
          <p className="mb-1.5 text-xs text-(--text-muted)">Battle starts in {timer.secondsLeft}s</p>
          <TimerBar seconds={timer.secondsLeft} total={timer.total} urgentAt={10} />
        </div>
      )}
    </div>
  );
}

export default function ShipPlacement({ state, myId, timer, sending, onDeploy }: ShipPlacementProps) {
  const gridSize = state.gridSize;
  const width = useViewportWidth();
  const cellSize = fitCellSize(width - 24, gridSize, true);

  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<string | null>(SHIPS[0].id);
  const [direction, setDirection] = useState<Direction>('horizontal');
  const [nope, setNope] = useState(0);         // bumps to replay the "doesn't fit" shake
  const [hint, setHint] = useState<string | null>(null);

  const me = state.players.find(p => p.id === myId);
  if (!state.inGame) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl" aria-hidden="true">👀</p>
        <h2 className="mt-2 text-lg font-bold text-(--text-primary)">Watching this game</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">You&apos;ll get a fleet in the next one.</p>
      </div>
    );
  }
  if (me?.ready) return <ReadyScreen state={state} myId={myId} timer={timer} />;

  const placedIds = new Set(placements.map(p => p.shipId));
  const allPlaced = SHIPS.every(s => placedIds.has(s.id));

  // Board picture of the current layout
  const grid: CellState[][] = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => 'empty' as CellState));
  const shipMap: (string | null)[][] = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => null));
  for (const p of placements) {
    for (const c of shipCells(p, sizeOf(p.shipId))) {
      grid[c.row][c.col] = 'ship';
      shipMap[c.row][c.col] = p.shipId;
    }
  }

  const reject = (text: string) => {
    setNope(n => n + 1);
    setHint(text);
    navigator.vibrate?.(30);
  };

  const put = (candidate: Placement, failText: string): boolean => {
    if (!fitsOnBoard(candidate, placements, gridSize)) {
      reject(failText);
      return false;
    }
    setPlacements([...placements.filter(p => p.shipId !== candidate.shipId), candidate]);
    setHint(null);
    return true;
  };

  const rotate = (shipId: string) => {
    const current = placements.find(p => p.shipId === shipId);
    if (!current) return;
    const dir: Direction = current.direction === 'horizontal' ? 'vertical' : 'horizontal';
    put({ shipId, direction: dir, start: fitStart(shipId, current.start.row, current.start.col, dir, gridSize) }, 'No room to turn it there');
  };

  const handleTap = (row: number, col: number) => {
    const here = shipMap[row][col];
    if (here) {
      // Tap a ship to pick it up, tap it again to turn it
      if (selected === here) rotate(here);
      else {
        setSelected(here);
        setHint('Tap a square to move it, or tap it again to turn it');
      }
      return;
    }
    if (!selected) {
      setHint('Pick a ship first');
      return;
    }
    const existing = placements.find(p => p.shipId === selected);
    const dir = existing?.direction ?? direction;
    if (put({ shipId: selected, direction: dir, start: fitStart(selected, row, col, dir, gridSize) }, 'That spot overlaps another ship')) {
      if (existing) {
        setSelected(null);
      } else {
        // On to the next ship that still needs a spot
        const nextShip = SHIPS.find(s => s.id !== selected && !placedIds.has(s.id));
        setSelected(nextShip?.id ?? null);
      }
    }
  };

  const selectedPlaced = !!selected && placedIds.has(selected);
  const selectedShip = SHIPS.find(s => s.id === selected);
  const placementTimer = timer && timer.playerId === null ? timer : null;

  return (
    <div className="flex flex-1 flex-col px-3 pt-1">
      <div className="px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-(--text-primary)">Deploy your fleet</h2>
          {placementTimer && (
            <span className={`font-mono text-sm font-bold tabular-nums ${placementTimer.secondsLeft <= 10 ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-secondary)'}`}>
              {placementTimer.secondsLeft}s
            </span>
          )}
        </div>
        {placementTimer && (
          <div className="mt-1.5">
            <TimerBar seconds={placementTimer.secondsLeft} total={placementTimer.total} urgentAt={10} />
            <p className="bs-tall-only mt-1 text-[11px] text-(--text-muted)">Anything unplaced is placed for you when time runs out.</p>
          </div>
        )}
      </div>

      {/* Ship dock: one row, so the board and the Ready button fit on short phones */}
      <div className="mt-2.5 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Ships">
        {SHIPS.map(ship => {
          const isSelected = selected === ship.id;
          const placed = placedIds.has(ship.id);
          return (
            <button
              key={ship.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${ship.name}, ${ship.size} squares${placed ? ', placed' : ''}`}
              onClick={() => {
                setSelected(isSelected ? null : ship.id);
                setHint(null);
              }}
              className={`bs-chip flex min-h-11 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-center ${isSelected ? 'bs-chip-target' : ''}`}
            >
              <span className="flex gap-[2px]" aria-hidden="true">
                {Array.from({ length: ship.size }, (_, i) => (
                  <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: SHIP_COLOR_VARS[ship.id], opacity: placed && !isSelected ? 0.5 : 1 }} />
                ))}
              </span>
              <span
                className={`w-full truncate text-[11px] font-semibold leading-tight ${placed ? 'text-(--success)' : 'text-(--text-primary)'}`}
                aria-hidden="true"
              >
                {placed && '✓ '}{ship.name}
              </span>
            </button>
          );
        })}
      </div>

      <p key={nope} className={`mt-2 min-h-5 px-1 text-center text-xs ${nope > 0 && hint ? 'bs-nope' : ''} ${hint ? 'text-(--text-secondary)' : 'text-(--text-muted)'}`} role="status">
        {hint ?? (selectedShip
          ? `Tap the board to place your ${selectedShip.name} (${selectedPlaced ? 'moving it' : direction === 'horizontal' ? 'across' : 'down'})`
          : allPlaced ? 'All set. Tap a ship to move or turn it.' : 'Pick a ship to place')}
      </p>

      <div className="mt-1 flex justify-center">
        <Board
          grid={grid}
          shipMap={shipMap}
          cellSize={cellSize}
          labels
          ariaLabel="Your fleet: tap a square to place the selected ship"
          onTap={handleTap}
          selectedShipId={selected}
        />
      </div>

      {/* Tools */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (selectedPlaced && selected) rotate(selected);
            else setDirection(d => (d === 'horizontal' ? 'vertical' : 'horizontal'));
          }}
          className="bs-chip flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-(--text-primary)"
        >
          <span aria-hidden="true">{direction === 'horizontal' && !selectedPlaced ? '→' : selectedPlaced ? '↻' : '↓'}</span>
          {selectedPlaced ? 'Turn ship' : direction === 'horizontal' ? 'Across' : 'Down'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlacements(randomFleet(gridSize));
            setSelected(null);
            setHint('Shuffled! Tap a ship to move or turn it');
          }}
          className="bs-chip flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-(--text-primary)"
        >
          <span aria-hidden="true">🎲</span> Shuffle
        </button>
        <button
          type="button"
          onClick={() => {
            setPlacements([]);
            setSelected(SHIPS[0].id);
            setHint(null);
          }}
          disabled={placements.length === 0}
          className="bs-chip flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-(--text-secondary) disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <div className="bs-footer -mx-3 mt-auto px-3 pt-2.5 bs-safe-bottom">
        <button
          type="button"
          onClick={() => onDeploy(placements)}
          disabled={!allPlaced || sending}
          className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-[transform,opacity] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
        >
          {sending ? 'Deploying…' : allPlaced ? '⚓ Ready for battle' : `Place ${SHIPS.length - placedIds.size} more ship${SHIPS.length - placedIds.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
