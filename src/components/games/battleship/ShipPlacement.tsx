'use client';

import { useState, useCallback } from 'react';
import type { ShipPlacement as ShipPlacementType, Coordinate, Direction } from '@/types/games/battleship';
import type { BattleshipPlayerInfo } from '@/types/games/battleship';
import { SHIPS, GRID_LABELS_COL, SHIP_COLORS } from '@/types/games/battleship';
import GridCell from './GridCell';

interface ShipPlacementProps {
  gridSize: number;
  onPlaceShips: (placements: ShipPlacementType[]) => void;
  onAutoPlace: () => void;
  placementTimer: number | null;
  isReady: boolean;
  players: BattleshipPlayerInfo[];
}

type CellState = 'empty' | 'ship' | 'preview' | 'invalid';

export default function ShipPlacement({
  gridSize,
  onPlaceShips,
  onAutoPlace,
  placementTimer,
  isReady,
  players,
}: ShipPlacementProps) {
  const [placements, setPlacements] = useState<ShipPlacementType[]>([]);
  const [selectedShipId, setSelectedShipId] = useState<string | null>(SHIPS[0]?.id || null);
  const [direction, setDirection] = useState<Direction>('horizontal');
  const [previewCells, setPreviewCells] = useState<Coordinate[]>([]);
  const [invalidPreview, setInvalidPreview] = useState(false);

  const placedShipIds = placements.map(p => p.shipId);
  const remainingShips = SHIPS.filter(s => !placedShipIds.includes(s.id));
  const allPlaced = remainingShips.length === 0;

  // Build grid state from current placements
  const getGridState = useCallback((): { grid: CellState[][]; shipIdMap: (string | null)[][] } => {
    if (gridSize <= 0) {
      return { grid: [], shipIdMap: [] };
    }

    const grid: CellState[][] = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => 'empty')
    );
    const shipIdMap: (string | null)[][] = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => null)
    );

    for (const p of placements) {
      const shipDef = SHIPS.find(s => s.id === p.shipId);
      if (!shipDef) continue;
      for (let i = 0; i < shipDef.size; i++) {
        const r = p.direction === 'vertical' ? p.start.row + i : p.start.row;
        const c = p.direction === 'horizontal' ? p.start.col + i : p.start.col;
        if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
          grid[r][c] = 'ship';
          shipIdMap[r][c] = p.shipId;
        }
      }
    }

    // Add preview
    for (const cell of previewCells) {
      if (cell.row >= 0 && cell.row < gridSize && cell.col >= 0 && cell.col < gridSize) {
        if (grid[cell.row][cell.col] === 'empty') {
          grid[cell.row][cell.col] = invalidPreview ? 'invalid' : 'preview';
        }
      }
    }

    return { grid, shipIdMap };
  }, [placements, previewCells, invalidPreview, gridSize]);

  const isValidPlacement = (start: Coordinate, dir: Direction, size: number): boolean => {
    const occupiedCells = new Set<string>();
    for (const p of placements) {
      const shipDef = SHIPS.find(s => s.id === p.shipId);
      if (!shipDef) continue;
      for (let i = 0; i < shipDef.size; i++) {
        const r = p.direction === 'vertical' ? p.start.row + i : p.start.row;
        const c = p.direction === 'horizontal' ? p.start.col + i : p.start.col;
        occupiedCells.add(`${r},${c}`);
      }
    }

    for (let i = 0; i < size; i++) {
      const r = dir === 'vertical' ? start.row + i : start.row;
      const c = dir === 'horizontal' ? start.col + i : start.col;
      if (r >= gridSize || c >= gridSize) return false;
      if (occupiedCells.has(`${r},${c}`)) return false;
    }
    return true;
  };

  const handleCellTap = (row: number, col: number) => {
    if (!selectedShipId || allPlaced || isReady) return;

    const shipDef = SHIPS.find(s => s.id === selectedShipId);
    if (!shipDef) return;

    const start: Coordinate = { row, col };

    if (isValidPlacement(start, direction, shipDef.size)) {
      const newPlacements = [...placements, { shipId: selectedShipId, start, direction }];
      setPlacements(newPlacements);
      setPreviewCells([]);

      // Auto-select next ship
      const nextShip = SHIPS.find(s => !newPlacements.map(p => p.shipId).includes(s.id));
      setSelectedShipId(nextShip?.id || null);
    }
  };

  const handleCellHover = (row: number, col: number) => {
    if (!selectedShipId || allPlaced || isReady) {
      setPreviewCells([]);
      return;
    }

    const shipDef = SHIPS.find(s => s.id === selectedShipId);
    if (!shipDef) return;

    const cells: Coordinate[] = [];
    for (let i = 0; i < shipDef.size; i++) {
      const r = direction === 'vertical' ? row + i : row;
      const c = direction === 'horizontal' ? col + i : col;
      cells.push({ row: r, col: c });
    }

    setPreviewCells(cells);
    setInvalidPreview(!isValidPlacement({ row, col }, direction, shipDef.size));
  };

  const handleUndo = () => {
    if (placements.length === 0) return;
    const removed = placements[placements.length - 1];
    setPlacements(placements.slice(0, -1));
    setSelectedShipId(removed.shipId);
  };

  const handleConfirm = () => {
    if (!allPlaced) return;
    onPlaceShips(placements);
  };

  const handleAutoPlace = () => {
    onAutoPlace();
  };

  const toggleDirection = () => {
    setDirection(d => d === 'horizontal' ? 'vertical' : 'horizontal');
    setPreviewCells([]);
  };

  const { grid, shipIdMap } = getGridState();
  const viewportWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth, 480) : 375;
  const availableWidth = viewportWidth - 48; // padding
  const labelWidth = 20;
  const cellSize = gridSize > 0 ? Math.min(Math.floor((availableWidth - labelWidth) / gridSize), 48) : 44;

  if (isReady) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="text-4xl">✅</div>
          <h2 className="text-lg font-bold text-(--text-primary)">Fleet Deployed!</h2>
          <p className="text-sm text-(--text-secondary)">Waiting for other players...</p>
          <div className="space-y-1">
            {players.map(p => (
              <div key={p.id} className="flex items-center justify-center gap-2 text-sm">
                <span>{p.avatar}</span>
                <span className="text-(--text-secondary)">{p.name}</span>
                <span className={p.ready ? 'text-(--success)' : 'text-(--text-muted)'}>
                  {p.ready ? '✓' : '...'}
                </span>
              </div>
            ))}
          </div>
          {placementTimer !== null && (
            <p className={`text-sm font-mono ${placementTimer <= 10 ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-muted)'}`}>
              {placementTimer}s
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-(--text-primary)">Deploy Your Fleet</h2>
          <p className="text-[10px] text-(--text-muted)">Tap a cell to place your ship</p>
        </div>
        {placementTimer !== null && (
          <div className={`text-lg font-mono font-bold ${
            placementTimer <= 10 ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-secondary)'
          }`}>
            {placementTimer}s
          </div>
        )}
      </div>

      {/* Ship selector */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {SHIPS.map(ship => {
          const isPlaced = placedShipIds.includes(ship.id);
          const isSelected = selectedShipId === ship.id;
          const color = SHIP_COLORS[ship.id];
          return (
            <button
              key={ship.id}
              onClick={() => !isPlaced && setSelectedShipId(ship.id)}
              disabled={isPlaced}
              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 ${
                isPlaced
                  ? 'bg-(--bg-card) text-(--text-muted) line-through opacity-50'
                  : isSelected
                    ? 'text-white font-medium'
                    : 'bg-(--bg-card) border border-(--border) text-(--text-secondary)'
              }`}
              style={isSelected && !isPlaced ? { backgroundColor: color.bg, borderColor: color.border } : undefined}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: isPlaced ? '#5e5678' : color.bg }}
              />
              {ship.name} ({ship.size})
            </button>
          );
        })}
      </div>

      {/* Direction toggle + undo */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={toggleDirection}
          className="px-3 py-1.5 rounded-lg text-xs bg-(--bg-card) border border-(--border) text-(--text-secondary) active:scale-95 transition-all"
        >
          {direction === 'horizontal' ? '→ Horizontal' : '↓ Vertical'}
        </button>
        {placements.length > 0 && (
          <button
            onClick={handleUndo}
            className="px-3 py-1.5 rounded-lg text-xs bg-(--bg-card) border border-(--border) text-(--text-secondary) active:scale-95 transition-all"
          >
            ↩ Undo
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 flex flex-col items-center">
        {/* Column labels */}
        <div className="flex" style={{ marginLeft: cellSize * 0.6 }}>
          {Array.from({ length: gridSize }, (_, i) => (
            <div
              key={i}
              className="text-[9px] text-(--text-muted) text-center"
              style={{ width: cellSize }}
            >
              {GRID_LABELS_COL[i]}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {grid.map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-center">
            {/* Row label */}
            <div
              className="text-[9px] text-(--text-muted) text-center"
              style={{ width: cellSize * 0.6 }}
            >
              {rowIdx + 1}
            </div>
            {row.map((cell, colIdx) => {
              let cellState: 'empty' | 'ship' | 'hit' | 'miss' | 'sunk' = 'empty';
              if (cell === 'ship') cellState = 'ship';
              const shipId = shipIdMap[rowIdx]?.[colIdx] || null;
              const shipColor = shipId ? SHIP_COLORS[shipId] : undefined;

              return (
                <div
                  key={colIdx}
                  onPointerEnter={() => handleCellHover(rowIdx, colIdx)}
                  onPointerLeave={() => setPreviewCells([])}
                >
                  <GridCell
                    state={cellState}
                    row={rowIdx}
                    col={colIdx}
                    onTap={handleCellTap}
                    disabled={allPlaced}
                    highlight={cell === 'preview'}
                    shipColor={shipColor}
                    size={cellSize}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="space-y-2 mt-4">
        {allPlaced ? (
          <button
            onClick={handleConfirm}
            className="w-full py-3.5 bg-(--game-accent) text-white rounded-xl font-semibold active:scale-[0.97] transition-all"
          >
            ✓ Confirm Placement
          </button>
        ) : (
          <button
            onClick={handleAutoPlace}
            className="w-full py-3 bg-(--bg-card) border border-(--border) text-(--text-secondary) rounded-xl text-sm active:scale-[0.97] transition-all"
          >
            🎲 Auto-Place Ships
          </button>
        )}
      </div>
    </div>
  );
}
