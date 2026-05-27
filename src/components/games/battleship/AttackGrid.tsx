'use client';

import { useState, useEffect } from 'react';
import type { BattleshipClientState, Coordinate, CellState, ShotEntry } from '@/types/games/battleship';
import { GRID_LABELS_COL, SHIP_COLORS } from '@/types/games/battleship';
import GridCell from './GridCell';

interface AttackGridProps {
  gameState: BattleshipClientState;
  myId: string;
  onFire: (targetId: string, coordinate: Coordinate) => void;
  onUseSonar: (targetId: string, topLeft: Coordinate) => void;
  shotResult: ShotEntry | null;
  sonarResult: { hasShip: boolean; topLeft: { row: number; col: number }; targetId: string } | null;
}

export default function AttackGrid({
  gameState,
  myId,
  onFire,
  onUseSonar,
  shotResult,
  sonarResult,
}: AttackGridProps) {
  const { players, attackGrids, myGrid, myShipMap, isMyTurn, shotsRemaining, settings, sonarUsed, currentTurnShots } = gameState;

  const opponents = players.filter(p => p.id !== myId && p.alive);
  const opponentIds = opponents.map(p => p.id).join(',');
  const [selectedTarget, setSelectedTarget] = useState<string>(opponents[0]?.id || '');
  const [sonarMode, setSonarMode] = useState(false);

  // Reset sonar mode when turn changes
  useEffect(() => {
    if (!isMyTurn) {
      setSonarMode(false);
    }
  }, [isMyTurn]);

  // Auto-select first opponent if none selected
  useEffect(() => {
    if (isMyTurn && opponents.length > 0 && !selectedTarget) {
      setSelectedTarget(opponents[0]?.id || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, opponentIds, selectedTarget]);

  // Update selected target if current target is eliminated
  useEffect(() => {
    if (selectedTarget && !opponents.find(p => p.id === selectedTarget)) {
      setSelectedTarget(opponents[0]?.id || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentIds, selectedTarget]);

  const gridSize = settings.gridSize;
  // Use actual viewport width on client, fallback to 375 for SSR
  const viewportWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth, 480) : 375;
  const availableWidth = viewportWidth - 32; // padding
  const labelWidth = 20;
  const cellSize = Math.min(Math.floor((availableWidth - labelWidth) / gridSize), 48);
  const miniCellSize = Math.max(Math.floor(cellSize * 0.38), 8);

  const currentGrid: CellState[][] = attackGrids[selectedTarget] || Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => 'empty' as CellState)
  );

  // Sonar highlight cells
  const sonarHighlightCells = new Set<string>();
  if (sonarResult && sonarResult.targetId === selectedTarget) {
    for (let r = sonarResult.topLeft.row; r < sonarResult.topLeft.row + 2 && r < gridSize; r++) {
      for (let c = sonarResult.topLeft.col; c < sonarResult.topLeft.col + 2 && c < gridSize; c++) {
        sonarHighlightCells.add(`${r},${c}`);
      }
    }
  }

  const handleCellTap = (row: number, col: number) => {
    if (!isMyTurn || shotsRemaining <= 0) return;
    if (!selectedTarget) return;

    if (sonarMode) {
      onUseSonar(selectedTarget, { row, col });
      setSonarMode(false);
      return;
    }

    // Check if already shot
    if (currentGrid[row][col] !== 'empty') return;

    onFire(selectedTarget, { row, col });
  };

  const canFire = isMyTurn && shotsRemaining > 0;
  const allShotsFired = isMyTurn && shotsRemaining === 0;

  // Incoming hits on MY grid this round (from other players' turns)
  const incomingHits = currentTurnShots.filter(s => s.targetId === myId);

  return (
    <div className="flex flex-col h-full">
      {/* Target selector */}
      {opponents.length > 1 && (
        <div className="flex gap-1.5 px-1 mb-2 overflow-x-auto pb-1">
          {opponents.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedTarget(p.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all active:scale-95 ${
                selectedTarget === p.id
                  ? 'bg-(--game-accent)/15 border-2 border-(--game-accent)/60 text-(--text-primary)'
                  : 'bg-(--bg-card) border border-(--border) text-(--text-secondary)'
              }`}
            >
              <span className="text-base">{p.avatar}</span>
              <span className="font-medium">{p.name}</span>
              <div className="flex gap-0.5 ml-1">
                {Array.from({ length: p.totalShips }, (_, i) => (
                  <span
                    key={i}
                    className={`inline-block w-1.5 h-2.5 rounded-sm transition-all ${
                      i < p.shipsRemaining ? 'bg-(--danger)' : 'bg-(--text-muted)/20'
                    }`}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Single opponent header */}
      {opponents.length === 1 && (
        <div className="px-1 mb-2 flex items-center gap-2">
          <span className="text-base">{opponents[0].avatar}</span>
          <span className="text-sm font-medium text-(--text-primary)">{opponents[0].name}</span>
          <div className="flex gap-0.5 ml-1">
            {Array.from({ length: opponents[0].totalShips }, (_, i) => (
              <span
                key={i}
                className={`inline-block w-1.5 h-2.5 rounded-sm ${
                  i < opponents[0].shipsRemaining ? 'bg-(--danger)' : 'bg-(--text-muted)/20'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sonar result banner */}
      {sonarResult && sonarResult.targetId === selectedTarget && (
        <div className={`mx-1 mb-2 px-3 py-2 rounded-xl text-center text-sm font-medium animate-slide-up ${
          sonarResult.hasShip
            ? 'bg-(--success)/15 border border-(--success)/30 text-(--success)'
            : 'bg-(--bg-card) border border-(--border) text-(--text-muted)'
        }`}>
          {sonarResult.hasShip ? '📡 Ship detected in scan area!' : '📡 All clear — no ships here'}
        </div>
      )}

      {/* Shot result toast */}
      {shotResult && (
        <div className={`mx-1 mb-2 px-3 py-2 rounded-xl text-center text-sm font-medium animate-slide-up ${
          shotResult.result === 'miss'
            ? 'bg-(--bg-card) border border-(--border) text-(--text-muted)'
            : shotResult.result === 'sunk'
              ? 'bg-(--danger)/15 border border-(--danger)/30 text-(--danger)'
              : 'bg-(--game-accent)/15 border border-(--game-accent)/30 text-(--game-accent)'
        }`}>
          {shotResult.playerId === myId ? (
            <>
              {shotResult.result === 'miss' && '💧 Miss!'}
              {shotResult.result === 'hit' && '💥 Hit!'}
              {shotResult.result === 'sunk' && `🔥 You sunk ${shotResult.targetName}'s ${shotResult.sunkShipName}!`}
            </>
          ) : shotResult.targetId === myId ? (
            <>
              {shotResult.result === 'miss' && `💧 ${shotResult.playerName} missed you`}
              {shotResult.result === 'hit' && `💥 ${shotResult.playerName} hit your ship!`}
              {shotResult.result === 'sunk' && `🔥 ${shotResult.playerName} sunk your ${shotResult.sunkShipName}!`}
            </>
          ) : (
            <>
              {shotResult.result === 'miss' && `${shotResult.playerName} → ${shotResult.targetName}: miss`}
              {shotResult.result === 'hit' && `${shotResult.playerName} hit ${shotResult.targetName}!`}
              {shotResult.result === 'sunk' && `🔥 ${shotResult.playerName} sunk ${shotResult.targetName}'s ${shotResult.sunkShipName}!`}
            </>
          )}
        </div>
      )}

      {/* Incoming fire notification */}
      {incomingHits.length > 0 && !isMyTurn && (
        <div className="mx-1 mb-2 px-3 py-2 rounded-xl text-center text-xs bg-(--danger)/10 border border-(--danger)/20 text-(--danger) animate-slide-up">
          ⚠️ {incomingHits[incomingHits.length - 1].playerName} fired at your fleet!
          {incomingHits.some(h => h.result === 'hit' || h.result === 'sunk') && ' — They hit something!'}
        </div>
      )}

      {/* Main Attack Grid */}
      <div className="flex flex-col items-center">
        {/* Column labels */}
        <div className="flex" style={{ marginLeft: labelWidth }}>
          {Array.from({ length: gridSize }, (_, i) => (
            <div
              key={i}
              className="text-[9px] text-(--text-muted) text-center font-mono"
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
              className="text-[9px] text-(--text-muted) text-center font-mono"
              style={{ width: labelWidth }}
            >
              {rowIdx + 1}
            </div>
            {row.map((cell, colIdx) => {
              const isSonarHighlight = sonarHighlightCells.has(`${rowIdx},${colIdx}`);
              return (
                <GridCell
                  key={colIdx}
                  state={cell}
                  row={rowIdx}
                  col={colIdx}
                  onTap={canFire ? handleCellTap : undefined}
                  disabled={!canFire || cell !== 'empty'}
                  highlight={isSonarHighlight}
                  sonarMode={sonarMode}
                  size={cellSize}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Mini-map: My Fleet (always visible below attack grid) */}
      <div className="mt-3 px-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-(--text-muted) font-medium">Your Fleet</span>
          <div className="flex-1 h-px bg-(--border)" />
        </div>
        <div className="flex flex-col items-center bg-[#080b11] rounded-lg p-2 border border-[#1e293b]/60">
          {myGrid.map((row, rowIdx) => (
            <div key={rowIdx} className="flex">
              {row.map((cell, colIdx) => {
                let miniColor = '#0f1219'; // empty — very dark
                let shipId: string | null = null;
                if (Array.isArray(myShipMap) && myShipMap.length > rowIdx && Array.isArray(myShipMap[rowIdx]) && myShipMap[rowIdx].length > colIdx) {
                  shipId = myShipMap[rowIdx][colIdx] || null;
                }

                if (cell === 'ship' || (cell === 'hit' && shipId)) {
                  if (cell === 'hit') {
                    miniColor = '#f97316'; // orange fire on ship
                  } else if (shipId && SHIP_COLORS[shipId]) {
                    miniColor = SHIP_COLORS[shipId].mini;
                  } else {
                    miniColor = '#22d3ee'; // fallback cyan
                  }
                } else if (cell === 'hit') {
                  miniColor = '#f97316';
                } else if (cell === 'miss') {
                  miniColor = '#1e293b';
                } else if (cell === 'sunk') {
                  miniColor = '#dc2626';
                }

                return (
                  <div
                    key={colIdx}
                    className="rounded-[2px]"
                    style={{
                      width: miniCellSize,
                      height: miniCellSize,
                      margin: 0.5,
                      backgroundColor: miniColor,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      {isMyTurn && (
        <div className="px-1 pt-3 pb-2 space-y-2">
          {/* Sonar button */}
          {settings.sonarPing && !sonarUsed && !allShotsFired && (
            <button
              onClick={() => setSonarMode(!sonarMode)}
              className={`w-full py-2.5 rounded-xl text-xs font-medium transition-all active:scale-[0.97] ${
                sonarMode
                  ? 'bg-(--success)/20 border-2 border-(--success)/50 text-(--success)'
                  : 'bg-(--bg-card) border border-(--border) text-(--text-secondary)'
              }`}
            >
              {sonarMode ? '📡 Tap a cell to scan 2×2 area — tap again to cancel' : '📡 Use Sonar Ping (1 use)'}
            </button>
          )}

          {/* Auto-advancing indicator after all shots fired */}
          {allShotsFired && (
            <div className="text-center py-3 animate-fade-in">
              <p className="text-sm text-(--text-secondary)">⏳ Advancing...</p>
            </div>
          )}

          {/* Shots counter */}
          {!allShotsFired && !sonarMode && (
            <div className="text-center">
              <p className="text-xs text-(--text-muted)">
                🎯 {shotsRemaining} shot{shotsRemaining !== 1 ? 's' : ''} remaining
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
