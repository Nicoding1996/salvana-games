import type { Room } from '@/types/hub';
import type {
  BattleshipClientState,
  BattleshipPlayerInfo,
  BattleshipServerPlayerData,
  BattleshipServerState,
  BattleshipSettings,
  BattleshipTimer,
  CellState,
  Coordinate,
  ShipPlacement,
  ShotEntry,
  ShotResult,
} from '@/types/games/battleship';
import {
  BATTLESHIP_MAX_PLAYERS,
  DEFAULT_BATTLESHIP_SETTINGS,
  SHIPS,
  clampSonar,
  fleetError,
  randomFleet,
  shipCells,
} from '@/types/games/battleship';

// ---- In-memory game store ----
const games = new Map<string, BattleshipServerState>();
const turnTimers = new Map<string, ReturnType<typeof setInterval>>();
const phaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

const TURN_TIMER_OPTIONS = [15, 30, 45, 0] as const;
const PLACEMENT_TIMER_OPTIONS = [30, 60, 0] as const;

/** Never trust settings from the client: clamp everything to the allowed options. */
function sanitizeSettings(input?: Partial<BattleshipSettings>): BattleshipSettings {
  const s = { ...DEFAULT_BATTLESHIP_SETTINGS, ...input };
  return {
    maxPlayers: Math.min(BATTLESHIP_MAX_PLAYERS, Math.max(2, Math.floor(Number(s.maxPlayers)) || BATTLESHIP_MAX_PLAYERS)),
    gridSize: s.gridSize === 10 ? 10 : 8,
    shotMode: s.shotMode === 'salvo' ? 'salvo' : 'classic',
    sonarPing: s.sonarPing === true,
    turnTimer: (TURN_TIMER_OPTIONS as readonly number[]).includes(s.turnTimer) ? s.turnTimer : DEFAULT_BATTLESHIP_SETTINGS.turnTimer,
    placementTimer: (PLACEMENT_TIMER_OPTIONS as readonly number[]).includes(s.placementTimer)
      ? s.placementTimer
      : DEFAULT_BATTLESHIP_SETTINGS.placementTimer,
  };
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function playerName(state: BattleshipServerState, room: Room, id: string): string {
  return room.players[id]?.name || state.playerData[id]?.name || 'Unknown';
}

function aliveIds(state: BattleshipServerState): string[] {
  return state.turnOrder.filter(id => state.playerData[id]?.alive);
}

/** Next player with ships afloat, clockwise from a seat. */
function nextAliveAfter(state: BattleshipServerState, id: string): string | null {
  const n = state.turnOrder.length;
  const start = Math.max(0, state.turnOrder.indexOf(id));
  for (let step = 1; step <= n; step++) {
    const candidate = state.turnOrder[(start + step) % n];
    if (state.playerData[candidate]?.alive) return candidate;
  }
  return null;
}

function setFleet(pd: BattleshipServerPlayerData, placements: ShipPlacement[]): void {
  pd.ships = placements.map(p => ({
    shipId: p.shipId,
    cells: shipCells(p, SHIPS.find(s => s.id === p.shipId)!.size),
    hits: [],
    sunk: false,
  }));
  pd.ready = true;
}

function finishIfOver(state: BattleshipServerState): boolean {
  if (state.phase !== 'battle') return false;
  const alive = aliveIds(state);
  if (alive.length > 1) return false;
  state.phase = 'finished';
  state.winnerId = alive[0] ?? null;
  state.activePlayerId = null;
  return true;
}

// ---- Lifecycle ----

export function createGame(room: Room, settings?: Partial<BattleshipSettings>): BattleshipServerState {
  clearTimers(room.code);
  const merged = sanitizeSettings(settings);

  const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);
  shuffleArray(playerIds);

  const playerData: Record<string, BattleshipServerPlayerData> = {};
  for (const id of playerIds) {
    playerData[id] = {
      name: room.players[id].name,
      avatar: room.players[id].avatar,
      ships: [],
      incomingShots: [],
      alive: true,
      ready: false,
      left: false,
      sonarUsed: false,
      sonarScan: null,
      stats: { shots: 0, hits: 0, sunk: 0 },
    };
  }

  const state: BattleshipServerState = {
    phase: 'placement',
    playerData,
    turnOrder: [...playerIds],
    activePlayerId: null,
    turnNumber: 0,
    settings: merged,
    turnShots: [],
    previousTurn: null,
    eliminationOrder: [],
    winnerId: null,
    placementTimerEnd: null,
    turnTimerEnd: null,
    turnTimerTotal: 0,
    turnTimerPlayerId: null,
  };

  games.set(room.code, state);
  console.log(`[Battleship] Game created in ${room.code} with ${playerIds.length} players`);
  return state;
}

export function getGameState(roomCode: string): BattleshipServerState | undefined {
  return games.get(roomCode);
}

export function endGame(roomCode: string): void {
  clearTimers(roomCode);
  games.delete(roomCode);
  console.log(`[Battleship] Game ended in ${roomCode}`);
}

// ---- Placement ----

export function placeShips(roomCode: string, playerId: string, placements: ShipPlacement[]): { success: boolean; error?: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'placement') return { success: false, error: 'Not in placement phase' };
  const pd = state.playerData[playerId];
  if (!pd || pd.left) return { success: false, error: 'You are not in this game' };
  if (pd.ready) return { success: false, error: 'Your fleet is already deployed' };

  const error = fleetError(placements, state.settings.gridSize);
  if (error) return { success: false, error };

  // Keep only the fields we expect from the client
  setFleet(pd, placements.map(p => ({
    shipId: p.shipId,
    start: { row: p.start.row, col: p.start.col },
    direction: p.direction,
  })));
  return { success: true };
}

/** Placement clock ran out: random fleets for everyone still placing. */
export function autoPlaceRemaining(roomCode: string): void {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'placement') return;
  for (const id of state.turnOrder) {
    const pd = state.playerData[id];
    if (pd && !pd.ready && !pd.left) setFleet(pd, randomFleet(state.settings.gridSize));
  }
}

/** Every connected player has deployed (offline players don't hold the battle up). */
export function allPlayersReady(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'placement') return false;
  const connected = state.turnOrder.filter(id => room.players[id]?.connected && !state.playerData[id]?.left);
  return connected.length > 0 && connected.every(id => state.playerData[id]?.ready);
}

/** Battle starts with everyone who deployed. Players who never placed watch. */
export function startBattle(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'placement') return false;

  state.turnOrder = state.turnOrder.filter(id => state.playerData[id]?.ready && !state.playerData[id]?.left);
  state.placementTimerEnd = null;
  state.phase = 'battle';
  state.turnNumber = 1;
  state.activePlayerId = state.turnOrder[0] ?? null;
  finishIfOver(state); // fewer than 2 fleets: nothing to fight
  return true;
}

// ---- Battle ----

export function getShotsForTurn(roomCode: string, playerId: string): number {
  const state = games.get(roomCode);
  const pd = state?.playerData[playerId];
  if (!state || !pd || !pd.alive) return 0;
  if (state.settings.shotMode === 'classic') return 1;
  // Salvo: one shot per ship still afloat
  return pd.ships.filter(s => !s.sunk).length;
}

export function getShotsRemainingForTurn(roomCode: string, playerId: string): number {
  const state = games.get(roomCode);
  if (!state || state.activePlayerId !== playerId) return 0;
  const fired = state.turnShots.filter(s => s.playerId === playerId).length;
  return Math.max(0, getShotsForTurn(roomCode, playerId) - fired);
}

export function fireShot(
  roomCode: string,
  playerId: string,
  targetId: string,
  coordinate: Coordinate,
  room: Room,
  auto = false,
): { success: boolean; shot?: ShotEntry; error?: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'battle') return { success: false, error: 'Not in battle phase' };
  if (state.activePlayerId !== playerId) return { success: false, error: 'Not your turn' };
  if (!state.playerData[playerId]?.alive) return { success: false, error: 'Your fleet is sunk' };
  if (getShotsRemainingForTurn(roomCode, playerId) <= 0) return { success: false, error: 'No shots left this turn' };
  if (targetId === playerId) return { success: false, error: 'You can’t fire at your own fleet' };

  const targetData = state.playerData[targetId];
  if (!targetData?.alive) return { success: false, error: 'That fleet is already sunk' };

  const row = Number(coordinate?.row);
  const col = Number(coordinate?.col);
  const gridSize = state.settings.gridSize;
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= gridSize || col < 0 || col >= gridSize) {
    return { success: false, error: 'Invalid coordinate' };
  }
  if (targetData.incomingShots.some(s => s.coordinate.row === row && s.coordinate.col === col)) {
    return { success: false, error: 'Already fired there' };
  }

  let result: ShotResult = 'miss';
  let sunkShipName: string | undefined;
  for (const ship of targetData.ships) {
    if (ship.sunk || !ship.cells.some(c => c.row === row && c.col === col)) continue;
    ship.hits.push({ row, col });
    if (ship.hits.length >= ship.cells.length) {
      ship.sunk = true;
      result = 'sunk';
      sunkShipName = SHIPS.find(s => s.id === ship.shipId)?.name;
    } else {
      result = 'hit';
    }
    break;
  }

  targetData.incomingShots.push({ coordinate: { row, col }, result });
  const stats = state.playerData[playerId].stats;
  stats.shots++;
  if (result !== 'miss') stats.hits++;
  if (result === 'sunk') stats.sunk++;

  const shot: ShotEntry = {
    playerId,
    playerName: playerName(state, room, playerId),
    targetId,
    targetName: playerName(state, room, targetId),
    coordinate: { row, col },
    result,
    ...(sunkShipName ? { sunkShipName } : {}),
    ...(auto ? { auto: true } : {}),
  };
  state.turnShots.push(shot);

  if (targetData.ships.every(s => s.sunk)) {
    targetData.alive = false;
    if (!state.eliminationOrder.includes(targetId)) state.eliminationOrder.push(targetId);
  }
  finishIfOver(state);

  return { success: true, shot };
}

/** Hand the turn on from `fromId` to the next fleet still afloat (keeping a recap of the turn). */
function passTurn(state: BattleshipServerState, fromId: string, room: Room): void {
  state.previousTurn = { playerId: fromId, playerName: playerName(state, room, fromId), shots: state.turnShots };
  state.turnShots = [];
  state.activePlayerId = nextAliveAfter(state, fromId);
  state.turnNumber++;
}

export function endTurn(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'battle' || !state.activePlayerId) return false;
  if (finishIfOver(state)) return true;
  passTurn(state, state.activePlayerId, room);
  return true;
}

export function pingSonar(
  roomCode: string,
  playerId: string,
  targetId: string,
  topLeft: Coordinate,
): { success: boolean; error?: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'battle') return { success: false, error: 'Not in battle phase' };
  if (!state.settings.sonarPing) return { success: false, error: 'Sonar is off in this game' };
  if (state.activePlayerId !== playerId) return { success: false, error: 'Not your turn' };
  if (getShotsRemainingForTurn(roomCode, playerId) <= 0) return { success: false, error: 'Your turn is over' };

  const pd = state.playerData[playerId];
  if (!pd || pd.sonarUsed) return { success: false, error: 'Sonar already used' };
  const targetData = state.playerData[targetId];
  if (targetId === playerId || !targetData?.alive) return { success: false, error: 'Pick an opponent still afloat' };

  const area = clampSonar(topLeft ?? { row: 0, col: 0 }, state.settings.gridSize);
  const hasShip = targetData.ships.some(ship => !ship.sunk && ship.cells.some(c =>
    c.row >= area.row && c.row < area.row + 2 && c.col >= area.col && c.col < area.col + 2));

  pd.sonarUsed = true;
  pd.sonarScan = { targetId, topLeft: area, hasShip };
  return { success: true };
}

/**
 * The turn timer ran out, or the player is away: fire their remaining shots at random
 * open water on random fleets still afloat. Returns the shots fired.
 */
export function autoFire(roomCode: string, room: Room): ShotEntry[] {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'battle' || !state.activePlayerId) return [];
  const shooter = state.activePlayerId;
  const fired: ShotEntry[] = [];
  const gridSize = state.settings.gridSize;

  while (state.phase === 'battle' && getShotsRemainingForTurn(roomCode, shooter) > 0) {
    const targets = aliveIds(state).filter(id => id !== shooter);
    if (targets.length === 0) break;
    const targetId = targets[Math.floor(Math.random() * targets.length)];
    const shot = new Set(state.playerData[targetId].incomingShots.map(s => `${s.coordinate.row},${s.coordinate.col}`));
    const open: Coordinate[] = [];
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) if (!shot.has(`${r},${c}`)) open.push({ row: r, col: c });
    }
    if (open.length === 0) break;
    const result = fireShot(roomCode, shooter, targetId, open[Math.floor(Math.random() * open.length)], room, true);
    if (!result.success || !result.shot) break;
    fired.push(result.shot);
  }
  return fired;
}

/**
 * A player left the room for good. While placing they're simply dropped; in battle
 * their fleet is scuttled (they're out). Returns true if the game changed.
 */
export function removePlayer(roomCode: string, playerId: string, room: Room): boolean {
  const state = games.get(roomCode);
  const pd = state?.playerData[playerId];
  if (!state || !pd || pd.left || state.phase === 'finished') return false;

  pd.left = true;
  if (state.phase === 'placement') {
    state.turnOrder = state.turnOrder.filter(id => id !== playerId);
    return true;
  }

  if (pd.alive) {
    pd.alive = false;
    if (!state.eliminationOrder.includes(playerId)) state.eliminationOrder.push(playerId);
  }
  if (finishIfOver(state)) return true;
  if (state.activePlayerId === playerId) passTurn(state, playerId, room);
  return true;
}

// ---- Client view ----

function emptyGrid<T>(size: number, value: T): T[][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => value));
}

export function getClientState(roomCode: string, playerId: string, room: Room): BattleshipClientState | null {
  const state = games.get(roomCode);
  if (!state) return null;
  const gridSize = state.settings.gridSize;

  const players: BattleshipPlayerInfo[] = state.turnOrder.map(id => {
    const pd = state.playerData[id];
    const rp = room.players[id];
    return {
      id,
      name: playerName(state, room, id),
      avatar: rp?.avatar || pd?.avatar || '⚓',
      alive: pd?.alive ?? false,
      connected: rp?.connected ?? false,
      shipsRemaining: pd?.ships.filter(s => !s.sunk).length ?? 0,
      totalShips: SHIPS.length,
      ready: pd?.ready ?? false,
      left: pd?.left ?? true,
      stats: { ...(pd?.stats ?? { shots: 0, hits: 0, sunk: 0 }) },
    };
  });

  // My ocean: my ships plus every shot fired at me
  const myData = state.playerData[playerId];
  const inGame = state.turnOrder.includes(playerId);
  const myGrid = emptyGrid<CellState>(gridSize, 'empty');
  const myShipMap = emptyGrid<string | null>(gridSize, null);
  if (myData && inGame) {
    for (const ship of myData.ships) {
      for (const cell of ship.cells) {
        myShipMap[cell.row][cell.col] = ship.shipId;
        myGrid[cell.row][cell.col] = ship.sunk
          ? 'sunk'
          : ship.hits.some(h => h.row === cell.row && h.col === cell.col) ? 'hit' : 'ship';
      }
    }
    for (const shot of myData.incomingShots) {
      if (shot.result === 'miss') myGrid[shot.coordinate.row][shot.coordinate.col] = 'miss';
    }
  }

  // Every opponent's ocean as everyone knows it: all shots are public
  const attackGrids: Record<string, CellState[][]> = {};
  for (const targetId of state.turnOrder) {
    if (targetId === playerId) continue;
    const targetData = state.playerData[targetId];
    if (!targetData) continue;
    const grid = emptyGrid<CellState>(gridSize, 'empty');
    for (const shot of targetData.incomingShots) grid[shot.coordinate.row][shot.coordinate.col] = shot.result;
    for (const ship of targetData.ships) {
      if (ship.sunk) for (const cell of ship.cells) grid[cell.row][cell.col] = 'sunk';
    }
    attackGrids[targetId] = grid;
  }

  const activeId = state.phase === 'battle' ? state.activePlayerId : null;
  return {
    phase: state.phase,
    players,
    myGrid,
    myShipMap,
    attackGrids,
    activePlayerId: activeId,
    isMyTurn: !!activeId && activeId === playerId,
    shotsRemaining: activeId === playerId ? getShotsRemainingForTurn(roomCode, playerId) : 0,
    shotsThisTurn: activeId ? getShotsForTurn(roomCode, activeId) : 0,
    turnShots: state.turnShots,
    previousTurn: state.previousTurn,
    turnNumber: state.turnNumber,
    settings: state.settings,
    gridSize,
    sonarUsed: myData?.sonarUsed ?? false,
    mySonar: myData?.sonarScan ?? null,
    eliminationOrder: [...state.eliminationOrder],
    winnerId: state.winnerId,
    inGame,
  };
}

export function getTurnTimerSnapshot(roomCode: string): BattleshipTimer | null {
  const state = games.get(roomCode);
  if (!state) return null;
  if (state.phase === 'battle' && state.turnTimerEnd && state.turnTimerPlayerId) {
    return {
      playerId: state.turnTimerPlayerId,
      secondsLeft: Math.max(0, Math.ceil((state.turnTimerEnd - Date.now()) / 1000)),
      total: state.turnTimerTotal,
    };
  }
  if (state.phase === 'placement' && state.placementTimerEnd) {
    return {
      playerId: null,
      secondsLeft: Math.max(0, Math.ceil((state.placementTimerEnd - Date.now()) / 1000)),
      total: state.settings.placementTimer,
    };
  }
  return null;
}

// ---- Reconnection ----

export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = games.get(roomCode);
  if (!state) return;
  const swap = (id: string) => (id === oldId ? newId : id);

  if (state.playerData[oldId]) {
    state.playerData[newId] = state.playerData[oldId];
    delete state.playerData[oldId];
  }
  state.turnOrder = state.turnOrder.map(swap);
  state.eliminationOrder = state.eliminationOrder.map(swap);
  if (state.activePlayerId) state.activePlayerId = swap(state.activePlayerId);
  if (state.turnTimerPlayerId) state.turnTimerPlayerId = swap(state.turnTimerPlayerId);
  if (state.winnerId) state.winnerId = swap(state.winnerId);

  const swapShot = (shot: ShotEntry) => {
    shot.playerId = swap(shot.playerId);
    shot.targetId = swap(shot.targetId);
  };
  state.turnShots.forEach(swapShot);
  if (state.previousTurn) {
    state.previousTurn.playerId = swap(state.previousTurn.playerId);
    state.previousTurn.shots.forEach(swapShot);
  }
  for (const pd of Object.values(state.playerData)) {
    if (pd.sonarScan) pd.sonarScan.targetId = swap(pd.sonarScan.targetId);
  }

  console.log(`[Battleship] Swapped player ID ${oldId} → ${newId}`);
}

// ---- Timers (one clock + one pending step per room) ----

export function setTurnTimer(roomCode: string, interval: ReturnType<typeof setInterval>): void {
  clearTurnTimer(roomCode);
  turnTimers.set(roomCode, interval);
}

export function clearTurnTimer(roomCode: string): void {
  const t = turnTimers.get(roomCode);
  if (t) {
    clearInterval(t);
    turnTimers.delete(roomCode);
  }
}

export function hasTurnTimer(roomCode: string): boolean {
  return turnTimers.has(roomCode);
}

export function setPhaseTimer(roomCode: string, timeout: ReturnType<typeof setTimeout>): void {
  clearPhaseTimer(roomCode);
  phaseTimers.set(roomCode, timeout);
}

export function clearPhaseTimer(roomCode: string): void {
  const t = phaseTimers.get(roomCode);
  if (t) {
    clearTimeout(t);
    phaseTimers.delete(roomCode);
  }
}

export function hasPhaseTimer(roomCode: string): boolean {
  return phaseTimers.has(roomCode);
}

function clearTimers(roomCode: string): void {
  clearTurnTimer(roomCode);
  clearPhaseTimer(roomCode);
}
