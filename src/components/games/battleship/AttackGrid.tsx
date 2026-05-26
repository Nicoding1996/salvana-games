'use client';

import { useState, useEffect } from 'react';
import type { BattleshipClientState, Coordinate, CellState, ShotEntry } from '@/types/games/battleship';
import { GRID_LABELS_COL } from '@/types/games/battleship';
import GridCell from './GridCell';

interface AttackGridProps {
  gameState: BattleshipClientState;
  myId: string;
  onFire: (targetId: string, coordinate: Coordinate) => void;
  onEndTurn: () => void;
  onUseSonar: (targetId: string, topLeft: Coordinate) => void;
  shotResult: ShotEntry | null;
}

type ViewMode = 'attack' | 'fleet';

export default function AttackGrid({
  gameState,
  myId,
  onFire,
  onEndTurn,
  onUseSonar,
  shotResult,
}: AttackGridProps) {
  const { players, attackGrids, myGrid, isMyTurn, shotsRemaining, settings, sonarUsed } = gameState;

  const opponents = players.filter(p => p.id !== myId && p.alive);
  const [selectedTarget, setSelectedTarget] = useState<string>(opponents[0]?.id || '');
  const [viewMode, setViewMode] = useState<ViewMode>('attack');
  const [sonarMode, setSonarMode] = useState(false);

  // Reset sonar mode when turn changes
  useEffect(() => {
    if (!isMyTurn) {
      setSonarMode(false);
    }
  }, [isMyTurn]);

  // Update selected target if current target is eliminated
  const opponentIds = opponents.map(p => p.id).join(',');
  useEffect(() => {
    if (selectedTarget && !opponents.find(p => p.id === selectedTarget)) {
      setSelectedTarget(opponents[0]?.id || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentIds, selectedTarget]);

  const gridSize = settings.gridSize;
  const cellSize = Math.min(Math.floor((375 - 48) / gridSize), 44);

  const currentGrid: CellState[][] = viewMode === 'fleet'
    ? myGrid
    : (attackGrids[selectedTarget] || Array.from({ length: gridSize }, () =>
        Array.from({ length: gridSize }, () => 'empty' as CellState)
      ));

  const handleCellTap = (row: number, col: number) => {
    if (viewMode === 'fleet') return;
    if (!isMyTurn || shotsRemaining <= 0) return;

    if (sonarMode) {
      onUseSonar(selectedTarget, { row, col });
      setSonarMode(false);
      return;
    }

    // Check if already shot
    if (currentGrid[row][col] !== 'empty') return;

    onFire(selectedTarget, { row, col });
  };

  const handleEndTurn = () => {
    onEndTurn();
  };

  const canFire = isMyTurn && shotsRemaining > 0 && viewMode === 'attack';
  const allShotsFired = isMyTurn && shotsRemaining === 0;

  return (
    <div className="flex flex-col h-full">
      {/* View toggle tabs */}
      <div className="flex gap-1 mb-2 px-2">
        <button
          onClick={() => setViewMode('attack')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'attack'
              ? 'bg-(--game-accent) text-white'
              : 'bg-(--bg-card) border border-(--border) text-(--text-secondary)'
          }`}
        >
          🎯 Attack
        </button>
        <button
          onClick={() => setViewMode('fleet')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
            viewMode === 'fleet'
              ? 'bg-(--game-accent) text-white'
              : 'bg-(--bg-card) border border-(--border) text-(--text-secondary)'
          }`}
        >
          🚢 My Fleet
        </button>
      </div>

      {/* Target selector (attack mode only) */}
      {viewMode === 'attack' && opponents.length > 1 && (
        <div className="flex gap-1.5 px-2 mb-2 overflow-x-auto">
          {opponents.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedTarget(p.id)}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                selectedTarget === p.id
                  ? 'bg-(--game-accent)/20 border border-(--game-accent)/50 text-(--text-primary)'
                  : 'bg-(--bg-card) border border-(--border) text-(--text-secondary)'
              }`}
            >
              <span>{p.avatar}</span>
              <span>{p.name}</span>
              <div className="flex gap-0.5 ml-1">
                {Array.from({ length: p.totalShips }, (_, i) => (
                  <span
                    key={i}
                    className={`inline-block w-1 h-2 rounded-sm ${
                      i < p.shipsRemaining ? 'bg-(--danger)' : 'bg-(--text-muted)/30'
                    }`}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Single opponent header */}
      {viewMode === 'attack' && opponents.length === 1 && (
        <div className="px-2 mb-2">
          <p className="text-xs text-(--text-muted)">
            Targeting: {opponents[0].avatar} {opponents[0].name}
          </p>
        </div>
      )}

      {/* Shot result toast */}
      {shotResult && (
        <div className={`mx-2 mb-2 px-3 py-2 rounded-lg text-center text-sm font-medium animate-slide-up ${
          shotResult.result === 'miss'
            ? 'bg-(--bg-card) text-(--text-muted)'
            : shotResult.result === 'sunk'
              ? 'bg-(--danger)/20 text-(--danger)'
              : 'bg-(--game-accent)/20 text-(--game-accent)'
        }`}>
          {shotResult.result === 'miss' && '💧 Miss!'}
          {shotResult.result === 'hit' && '💥 Hit!'}
          {shotResult.result === 'sunk' && `🔥 You sunk their ${shotResult.sunkShipName}!`}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 flex flex-col items-center justify-center">
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
        {currentGrid.map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-center">
            <div
              className="text-[9px] text-(--text-muted) text-center"
              style={{ width: cellSize * 0.6 }}
            >
              {rowIdx + 1}
            </div>
            {row.map((cell, colIdx) => (
              <GridCell
                key={colIdx}
                state={cell}
                row={rowIdx}
                col={colIdx}
                onTap={canFire ? handleCellTap : undefined}
                disabled={!canFire || cell !== 'empty'}
                size={cellSize}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {isMyTurn && (
        <div className="px-2 py-3 space-y-2">
          {/* Sonar button */}
          {settings.sonarPing && !sonarUsed && viewMode === 'attack' && !allShotsFired && (
            <button
              onClick={() => setSonarMode(!sonarMode)}
              className={`w-full py-2.5 rounded-xl text-xs font-medium transition-all ${
                sonarMode
                  ? 'bg-(--game-secondary) text-white'
                  : 'bg-(--bg-card) border border-(--border) text-(--text-secondary)'
              }`}
            >
              {sonarMode ? '📡 Tap a cell to scan 2×2 area' : '📡 Use Sonar Ping'}
            </button>
          )}

          {/* End turn button */}
          {allShotsFired && (
            <button
              onClick={handleEndTurn}
              className="w-full py-3.5 bg-(--game-accent) text-white rounded-xl font-semibold active:scale-[0.97] transition-all animate-slide-up"
            >
              End Turn →
            </button>
          )}

          {/* Shots counter */}
          {!allShotsFired && (
            <div className="text-center">
              <p className="text-xs text-(--text-muted)">
                {shotsRemaining} shot{shotsRemaining !== 1 ? 's' : ''} remaining
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
