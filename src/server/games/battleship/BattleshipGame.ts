import type { Room } from '@/types/hub';
import type {
  BattleshipServerState,
  BattleshipServerPlayerData,
  BattleshipClientState,
  BattleshipPlayerInfo,
  BattleshipSettings,
  ShipPlacement,
  Coordinate,
  ShotResult,
  ShotEntry,
  CellState,
  ServerShipState,
} from '@/types/games/battleship';
import { DEFAULT_BATTLESHIP_SETTINGS, SHIPS } from '@/types/games/battleship';

// ---- In-memory game store ----
const games = new Map<string, BattleshipServerState>();
const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

// ---- Public API ----

export function createGame(room: Room, settings?: Partial<BattleshipSettings>): BattleshipServerState {
  const mergedSettings: BattleshipSettings = { ...DEFAULT_BATTLESHIP_SETTINGS, ...settings };

  // Build turn order from connected players (shuffled)
  const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);
  shuffleArray(playerIds);

  const playerData: Record<string, BattleshipServerPlayerData> = {};
  for (const id of playerIds) {
    playerData[id] = {
      ships: [],
      placements: [],
      incomingShots: [],
      alive: true,
      ready: false,
      sonarUsed: false,
    };
  }

  const state: BattleshipServerState = {
    phase: 'placement',
    playerData,
    turnOrder: [...playerIds],
    currentPlayerIndex: 0,
    roundNumber: 1,
    settings: mergedSettings,
    turnTimerEnd: null,
    lastTurnShots: [],
    eliminationOrder: [],
    placementTimerEnd: mergedSettings.placementTimer > 0
      ? Date.now() + mergedSettings.placementTimer * 1000
      : null,
  };

  games.set(room.code, state);
  console.log(`[Battleship] Game created in ${room.code} with ${playerIds.length} players`);
  return state;
}

export function placeShips(
  roomCode: string,
  playerId: string,
  placements: ShipPlacement[]
): { success: boolean; error?: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'placement') return { success: false, error: 'Not in placement phase' };

  const pd = state.playerData[playerId];
  if (!pd) return { success: false, error: 'Player not in game' };
  if (pd.ready) return { success: false, error: 'Already placed ships' };

  const gridSize = state.settings.gridSize;

  // Validate placements
  if (placements.length !== SHIPS.length) {
    return { success: false, error: `Must place exactly ${SHIPS.length} ships` };
  }

  const occupiedCells = new Set<string>();

  for (const placement of placements) {
    const shipDef = SHIPS.find(s => s.id === placement.shipId);
    if (!shipDef) return { success: false, error: `Unknown ship: ${placement.shipId}` };

    const cells = getShipCells(placement, shipDef.size);

    // Check bounds
    for (const cell of cells) {
      if (cell.row < 0 || cell.row >= gridSize || cell.col < 0 || cell.col >= gridSize) {
        return { success: false, error: `Ship ${shipDef.name} out of bounds` };
      }
      const key = `${cell.row},${cell.col}`;
      if (occupiedCells.has(key)) {
        return { success: false, error: `Ships overlap at ${key}` };
      }
      occupiedCells.add(key);
    }
  }

  // All valid — store
  pd.placements = placements;
  pd.ships = placements.map(p => {
    const shipDef = SHIPS.find(s => s.id === p.shipId)!;
    return {
      shipId: p.shipId,
      cells: getShipCells(p, shipDef.size),
      hits: [],
      sunk: false,
    };
  });
  pd.ready = true;

  return { success: true };
}

export function autoPlaceShips(roomCode: string, playerId: string): { success: boolean } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'placement') return { success: false };

  const pd = state.playerData[playerId];
  if (!pd || pd.ready) return { success: false };

  const gridSize = state.settings.gridSize;
  const placements = generateRandomPlacements(gridSize);

  if (!placements) return { success: false };

  pd.placements = placements;
  pd.ships = placements.map(p => {
    const shipDef = SHIPS.find(s => s.id === p.shipId)!;
    return {
      shipId: p.shipId,
      cells: getShipCells(p, shipDef.size),
      hits: [],
      sunk: false,
    };
  });
  pd.ready = true;

  return { success: true };
}

export function allPlayersReady(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state) return false;

  const connectedPlayers = state.turnOrder.filter(id => room.players[id]?.connected);
  return connectedPlayers.every(id => state.playerData[id]?.ready);
}

export function startBattle(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'placement') return false;

  state.phase = 'battle';
  state.placementTimerEnd = null;
  // Filter turn order to only ready players
  state.turnOrder = state.turnOrder.filter(id => state.playerData[id]?.ready);
  state.currentPlayerIndex = 0;

  return true;
}

export function fireShot(
  roomCode: string,
  playerId: string,
  targetId: string,
  coordinate: Coordinate,
  room: Room
): { success: boolean; result?: ShotResult; sunkShipName?: string; error?: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'battle') return { success: false, error: 'Not in battle phase' };

  // Verify it's this player's turn
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, error: 'Not your turn' };
  }

  // Verify player is alive
  if (!state.playerData[playerId]?.alive) {
    return { success: false, error: 'You are eliminated' };
  }

  // Verify target is alive and different from shooter
  if (targetId === playerId) return { success: false, error: 'Cannot shoot yourself' };
  if (!state.playerData[targetId]?.alive) return { success: false, error: 'Target is eliminated' };

  // Verify coordinate is valid
  const gridSize = state.settings.gridSize;
  if (coordinate.row < 0 || coordinate.row >= gridSize || coordinate.col < 0 || coordinate.col >= gridSize) {
    return { success: false, error: 'Invalid coordinate' };
  }

  // Check if already shot at this coordinate on this target
  const targetData = state.playerData[targetId];
  const alreadyShot = targetData.incomingShots.some(
    s => s.coordinate.row === coordinate.row && s.coordinate.col === coordinate.col
  );
  if (alreadyShot) return { success: false, error: 'Already fired at this coordinate' };

  // Determine result
  let result: ShotResult = 'miss';
  let sunkShipName: string | undefined;

  for (const ship of targetData.ships) {
    if (ship.sunk) continue;
    const hitCell = ship.cells.find(c => c.row === coordinate.row && c.col === coordinate.col);
    if (hitCell) {
      ship.hits.push(coordinate);
      if (ship.hits.length >= ship.cells.length) {
        ship.sunk = true;
        result = 'sunk';
        sunkShipName = SHIPS.find(s => s.id === ship.shipId)?.name;
      } else {
        result = 'hit';
      }
      break;
    }
  }

  // Record the shot
  targetData.incomingShots.push({ coordinate, result });

  const shotEntry: ShotEntry = {
    playerId,
    playerName: room.players[playerId]?.name || 'Unknown',
    targetId,
    targetName: room.players[targetId]?.name || 'Unknown',
    coordinate,
    result,
    sunkShipName,
  };
  state.lastTurnShots.push(shotEntry);

  // Check if target is eliminated (all ships sunk)
  const allSunk = targetData.ships.every(s => s.sunk);
  if (allSunk) {
    targetData.alive = false;
    state.eliminationOrder.push(targetId);
  }

  return { success: true, result, sunkShipName };
}

export function getShotsForTurn(roomCode: string, playerId: string): number {
  const state = games.get(roomCode);
  if (!state) return 0;

  const pd = state.playerData[playerId];
  if (!pd || !pd.alive) return 0;

  if (state.settings.shotMode === 'classic') return 1;

  // Salvo: shots = number of surviving ships
  return pd.ships.filter(s => !s.sunk).length;
}

export function endTurn(roomCode: string, room: Room): { gameOver: boolean; winnerId?: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'battle') return { gameOver: false };

  // Check game over
  const alivePlayers = state.turnOrder.filter(id => state.playerData[id]?.alive);
  if (alivePlayers.length <= 1) {
    state.phase = 'finished';
    return { gameOver: true, winnerId: alivePlayers[0] };
  }

  // Advance to next alive player
  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.turnOrder.length;
  } while (!state.playerData[state.turnOrder[state.currentPlayerIndex]]?.alive);

  state.lastTurnShots = [];
  state.roundNumber++;

  return { gameOver: false };
}

export function useSonar(
  roomCode: string,
  playerId: string,
  targetId: string,
  topLeft: Coordinate
): { success: boolean; hasShip?: boolean; error?: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'battle') return { success: false, error: 'Not in battle phase' };
  if (!state.settings.sonarPing) return { success: false, error: 'Sonar not enabled' };

  if (state.turnOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, error: 'Not your turn' };
  }

  const pd = state.playerData[playerId];
  if (!pd || pd.sonarUsed) return { success: false, error: 'Sonar already used' };

  const targetData = state.playerData[targetId];
  if (!targetData || !targetData.alive) return { success: false, error: 'Invalid target' };

  pd.sonarUsed = true;

  // Check 2x2 area for any ship cell
  const gridSize = state.settings.gridSize;
  let hasShip = false;
  for (let r = topLeft.row; r < topLeft.row + 2 && r < gridSize; r++) {
    for (let c = topLeft.col; c < topLeft.col + 2 && c < gridSize; c++) {
      for (const ship of targetData.ships) {
        if (ship.sunk) continue;
        if (ship.cells.some(cell => cell.row === r && cell.col === c)) {
          hasShip = true;
          break;
        }
      }
      if (hasShip) break;
    }
    if (hasShip) break;
  }

  return { success: true, hasShip };
}

export function getClientState(
  roomCode: string,
  playerId: string,
  room: Room
): BattleshipClientState | null {
  const state = games.get(roomCode);
  if (!state) return null;

  const gridSize = state.settings.gridSize;

  // Build player info
  const players: BattleshipPlayerInfo[] = state.turnOrder.map(id => {
    const pd = state.playerData[id];
    const rp = room.players[id];
    return {
      id,
      name: rp?.name || 'Unknown',
      avatar: rp?.avatar || '⚓',
      alive: pd?.alive || false,
      connected: rp?.connected || false,
      shipsRemaining: pd?.ships.filter(s => !s.sunk).length || 0,
      totalShips: SHIPS.length,
      ready: pd?.ready || false,
    };
  });

  // Build my grid (shows my ships + incoming hits)
  const myData = state.playerData[playerId];
  const myGrid: CellState[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => 'empty' as CellState)
  );

  if (myData) {
    // Place my ships
    for (const ship of myData.ships) {
      for (const cell of ship.cells) {
        if (ship.sunk) {
          myGrid[cell.row][cell.col] = 'sunk';
        } else if (ship.hits.some(h => h.row === cell.row && h.col === cell.col)) {
          myGrid[cell.row][cell.col] = 'hit';
        } else {
          myGrid[cell.row][cell.col] = 'ship';
        }
      }
    }
    // Mark misses on my grid
    for (const shot of myData.incomingShots) {
      if (shot.result === 'miss') {
        myGrid[shot.coordinate.row][shot.coordinate.col] = 'miss';
      }
    }
  }

  // Build attack grids (what I know about each opponent)
  const attackGrids: Record<string, CellState[][]> = {};
  for (const targetId of state.turnOrder) {
    if (targetId === playerId) continue;
    const targetData = state.playerData[targetId];
    if (!targetData) continue;

    const grid: CellState[][] = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => 'empty' as CellState)
    );

    for (const shot of targetData.incomingShots) {
      // Only show shots that THIS player fired (or all shots if target is eliminated for reveal)
      // Actually, show ALL shots on the target — all players can see where hits/misses are
      if (shot.result === 'miss') {
        grid[shot.coordinate.row][shot.coordinate.col] = 'miss';
      } else if (shot.result === 'hit') {
        grid[shot.coordinate.row][shot.coordinate.col] = 'hit';
      } else if (shot.result === 'sunk') {
        grid[shot.coordinate.row][shot.coordinate.col] = 'sunk';
      }
    }

    // Mark sunk ship cells
    for (const ship of targetData.ships) {
      if (ship.sunk) {
        for (const cell of ship.cells) {
          grid[cell.row][cell.col] = 'sunk';
        }
      }
    }

    attackGrids[targetId] = grid;
  }

  const activePlayerId = state.phase === 'battle' ? state.turnOrder[state.currentPlayerIndex] : null;
  const totalShots = activePlayerId === playerId ? getShotsForTurn(roomCode, playerId) : 0;
  const shotsFiredThisTurn = state.lastTurnShots.filter(s => s.playerId === playerId).length;
  const shotsRemaining = Math.max(0, totalShots - shotsFiredThisTurn);

  return {
    phase: state.phase,
    players,
    myGrid,
    attackGrids,
    activePlayerId,
    isMyTurn: activePlayerId === playerId,
    shotsRemaining,
    currentTurnShots: state.lastTurnShots,
    roundNumber: state.roundNumber,
    settings: state.settings,
    lastTurnSummary: state.lastTurnShots.length > 0 ? state.lastTurnShots : null,
    sonarUsed: myData?.sonarUsed || false,
    gridSize,
    isFirstRound: state.roundNumber === 1 && state.currentPlayerIndex === 0,
  };
}

export function getGameState(roomCode: string): BattleshipServerState | undefined {
  return games.get(roomCode);
}

export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = games.get(roomCode);
  if (!state) return;

  // Swap in playerData
  if (state.playerData[oldId]) {
    state.playerData[newId] = state.playerData[oldId];
    delete state.playerData[oldId];
  }

  // Swap in turnOrder
  const turnIdx = state.turnOrder.indexOf(oldId);
  if (turnIdx !== -1) state.turnOrder[turnIdx] = newId;

  // Swap in eliminationOrder
  const elimIdx = state.eliminationOrder.indexOf(oldId);
  if (elimIdx !== -1) state.eliminationOrder[elimIdx] = newId;

  // Swap in lastTurnShots
  for (const shot of state.lastTurnShots) {
    if (shot.playerId === oldId) shot.playerId = newId;
    if (shot.targetId === oldId) shot.targetId = newId;
  }

  console.log(`[Battleship] Swapped player ID ${oldId} → ${newId}`);
}

export function endGame(roomCode: string): void {
  clearRoomTimer(roomCode);
  games.delete(roomCode);
  console.log(`[Battleship] Game ended in ${roomCode}`);
}

export function setRoomTimer(roomCode: string, interval: ReturnType<typeof setInterval>): void {
  clearRoomTimer(roomCode);
  activeTimers.set(roomCode, interval);
}

export function clearRoomTimer(roomCode: string): void {
  const existing = activeTimers.get(roomCode);
  if (existing) {
    clearInterval(existing);
    activeTimers.delete(roomCode);
  }
}

/**
 * Handle disconnected player's turn: fire random shots at random targets.
 */
export function handleDisconnectedTurn(roomCode: string, room: Room): ShotEntry[] {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'battle') return [];

  const activeId = state.turnOrder[state.currentPlayerIndex];
  if (!activeId) return [];

  const totalShots = getShotsForTurn(roomCode, activeId);
  // Subtract shots already fired this turn
  const alreadyFired = state.lastTurnShots.filter(s => s.playerId === activeId).length;
  const remainingShots = totalShots - alreadyFired;
  if (remainingShots <= 0) return [];

  const firedShots: ShotEntry[] = [];

  const aliveTargets = state.turnOrder.filter(id => id !== activeId && state.playerData[id]?.alive);
  if (aliveTargets.length === 0) return [];

  for (let i = 0; i < remainingShots; i++) {
    const targetId = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
    const targetData = state.playerData[targetId];
    if (!targetData) continue;

    // Find a cell not yet shot
    const gridSize = state.settings.gridSize;
    const shotCells = new Set(targetData.incomingShots.map(s => `${s.coordinate.row},${s.coordinate.col}`));
    const available: Coordinate[] = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (!shotCells.has(`${r},${c}`)) available.push({ row: r, col: c });
      }
    }
    if (available.length === 0) continue;

    const coord = available[Math.floor(Math.random() * available.length)];
    const result = fireShot(roomCode, activeId, targetId, coord, room);
    if (result.success) {
      firedShots.push({
        playerId: activeId,
        playerName: room.players[activeId]?.name || 'Unknown',
        targetId,
        targetName: room.players[targetId]?.name || 'Unknown',
        coordinate: coord,
        result: result.result!,
        sunkShipName: result.sunkShipName,
      });
    }
  }

  return firedShots;
}

// ---- Internal helpers ----

function getShipCells(placement: ShipPlacement, size: number): Coordinate[] {
  const cells: Coordinate[] = [];
  for (let i = 0; i < size; i++) {
    if (placement.direction === 'horizontal') {
      cells.push({ row: placement.start.row, col: placement.start.col + i });
    } else {
      cells.push({ row: placement.start.row + i, col: placement.start.col });
    }
  }
  return cells;
}

function generateRandomPlacements(gridSize: number): ShipPlacement[] | null {
  const placements: ShipPlacement[] = [];
  const occupied = new Set<string>();

  for (const ship of SHIPS) {
    let placed = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const direction: 'horizontal' | 'vertical' = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const maxRow = direction === 'vertical' ? gridSize - ship.size : gridSize - 1;
      const maxCol = direction === 'horizontal' ? gridSize - ship.size : gridSize - 1;

      const row = Math.floor(Math.random() * (maxRow + 1));
      const col = Math.floor(Math.random() * (maxCol + 1));

      const cells = getShipCells({ shipId: ship.id, start: { row, col }, direction }, ship.size);
      const conflict = cells.some(c => occupied.has(`${c.row},${c.col}`));

      if (!conflict) {
        cells.forEach(c => occupied.add(`${c.row},${c.col}`));
        placements.push({ shipId: ship.id, start: { row, col }, direction });
        placed = true;
        break;
      }
    }
    if (!placed) return null; // Failed to place (shouldn't happen with reasonable grid)
  }

  return placements;
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
