// ============================================
// Battleship — Shared game types & constants
// ============================================

// ---- Phases ----

export type BattleshipPhase =
  | 'placement'    // players placing ships on their grids
  | 'battle'       // turn-based firing
  | 'finished';    // game over, winner declared

// ---- Settings ----

export interface BattleshipSettings {
  maxPlayers: number;            // 2–4
  gridSize: 8 | 10;
  shotMode: 'salvo' | 'classic'; // salvo = shots equal surviving ships, classic = 1 per turn
  sonarPing: boolean;
  turnTimer: 15 | 30 | 45 | 0;   // seconds, 0 = off
  placementTimer: 30 | 60 | 0;   // seconds, 0 = off
}

export const DEFAULT_BATTLESHIP_SETTINGS: BattleshipSettings = {
  maxPlayers: 4,
  gridSize: 8,
  shotMode: 'classic',
  sonarPing: false,
  turnTimer: 30,
  placementTimer: 60,
};

// ---- Ship Definitions ----

export interface ShipDef {
  id: string;
  name: string;
  size: number;
}

export const SHIPS: ShipDef[] = [
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser', name: 'Cruiser', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'destroyer', name: 'Destroyer', size: 2 },
];

/** Own-fleet color per ship type (CSS custom properties from the Battleship theme). */
export const SHIP_COLOR_VARS: Record<string, string> = {
  battleship: 'var(--bs-ship-battleship)',
  cruiser: 'var(--bs-ship-cruiser)',
  submarine: 'var(--bs-ship-submarine)',
  destroyer: 'var(--bs-ship-destroyer)',
};

// ---- Coordinate & Placement ----

export interface Coordinate {
  row: number;
  col: number;
}

export type Direction = 'horizontal' | 'vertical';

export interface ShipPlacement {
  shipId: string;
  start: Coordinate;
  direction: Direction;
}

// ---- Shot & Result ----

export type ShotResult = 'miss' | 'hit' | 'sunk';

export interface ShotEntry {
  playerId: string;       // who fired
  playerName: string;
  targetId: string;       // who was targeted
  targetName: string;
  coordinate: Coordinate;
  result: ShotResult;
  sunkShipName?: string;  // if result is 'sunk', which ship
  auto?: boolean;         // fired by the server (turn timer ran out / player away)
}

/** A sonar ping: was any ship in the 2×2 area? Private to the player who pinged. */
export interface SonarScan {
  targetId: string;
  topLeft: Coordinate;
  hasShip: boolean;
}

export interface BattleshipPlayerStats {
  shots: number;
  hits: number;           // hits and sinking shots
  sunk: number;           // ships sunk
}

// ---- Client State ----

export interface BattleshipPlayerInfo {
  id: string;
  name: string;
  avatar: string;
  alive: boolean;
  connected: boolean;
  shipsRemaining: number;  // how many ships still afloat
  totalShips: number;
  ready: boolean;          // has placed ships (placement phase)
  left: boolean;           // left the game for good
  stats: BattleshipPlayerStats;
}

export interface BattleshipTurnRecap {
  playerId: string;
  playerName: string;
  shots: ShotEntry[];
}

export interface BattleshipClientState {
  phase: BattleshipPhase;
  players: BattleshipPlayerInfo[];          // turn order
  myGrid: CellState[][];                    // my ocean grid (ships + incoming shots)
  myShipMap: (string | null)[][];           // which ship ID occupies each cell (null = no ship)
  attackGrids: Record<string, CellState[][]>; // what everyone knows about each opponent's grid
  activePlayerId: string | null;
  isMyTurn: boolean;
  shotsRemaining: number;                   // shots I have left this turn
  shotsThisTurn: number;                    // shots the active player gets this turn
  turnShots: ShotEntry[];                   // shots fired so far this turn
  previousTurn: BattleshipTurnRecap | null; // the last completed turn, for the recap line
  turnNumber: number;
  settings: BattleshipSettings;
  gridSize: number;
  sonarUsed: boolean;
  mySonar: SonarScan | null;
  eliminationOrder: string[];               // first sunk → last sunk
  winnerId: string | null;
  inGame: boolean;                          // I have a fleet in this game
}

/** Clock of the player whose turn it is (or the placement clock). null = no clock running. */
export interface BattleshipTimer {
  playerId: string | null;                  // null for the placement clock
  secondsLeft: number;
  total: number;
}

// ---- Cell State (what the client sees) ----

export type CellState =
  | 'empty'       // unknown / water
  | 'ship'        // my ship segment (only on myGrid)
  | 'hit'         // confirmed hit
  | 'miss'        // confirmed miss
  | 'sunk';       // part of a sunk ship

// ---- Server State ----

export interface ServerShipState {
  shipId: string;
  cells: Coordinate[];
  hits: Coordinate[];
  sunk: boolean;
}

export interface BattleshipServerPlayerData {
  name: string;           // kept so players who leave still show up in the standings
  avatar: string;
  ships: ServerShipState[];
  incomingShots: { coordinate: Coordinate; result: ShotResult }[];
  alive: boolean;
  ready: boolean;
  left: boolean;
  sonarUsed: boolean;
  sonarScan: SonarScan | null;
  stats: BattleshipPlayerStats;
}

export interface BattleshipServerState {
  phase: BattleshipPhase;
  playerData: Record<string, BattleshipServerPlayerData>;
  turnOrder: string[];                      // players in the battle, in turn order
  activePlayerId: string | null;
  turnNumber: number;
  settings: BattleshipSettings;
  turnShots: ShotEntry[];
  previousTurn: BattleshipTurnRecap | null;
  eliminationOrder: string[];
  winnerId: string | null;
  placementTimerEnd: number | null;
  turnTimerEnd: number | null;
  turnTimerTotal: number;
  turnTimerPlayerId: string | null;
}

// ---- Constants ----

export const BATTLESHIP_MIN_PLAYERS = 2;
export const BATTLESHIP_MAX_PLAYERS = 4;
/** Pause after the last shot of a turn so everyone sees where it landed */
export const BS_TURN_END_DELAY_MS = 1200;
/** Same, after the server fired for someone who ran out of time */
export const BS_AUTO_TURN_END_DELAY_MS = 1800;
/** An offline player's turn is fired for them after this long */
export const BS_AWAY_GRACE_S = 10;

export const GRID_LABELS_COL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** "B7"-style name for a cell */
export function cellName(c: Coordinate): string {
  return `${GRID_LABELS_COL[c.col] ?? '?'}${c.row + 1}`;
}

// ---- Fleet helpers (shared by the server's validation and the placement screen) ----

export function shipCells(placement: ShipPlacement, size: number): Coordinate[] {
  return Array.from({ length: size }, (_, i) => placement.direction === 'horizontal'
    ? { row: placement.start.row, col: placement.start.col + i }
    : { row: placement.start.row + i, col: placement.start.col });
}

function shipSize(shipId: string): number {
  return SHIPS.find(s => s.id === shipId)?.size ?? 0;
}

/** Does this ship fit on the board without touching the cells already taken? */
export function fitsOnBoard(candidate: ShipPlacement, others: ShipPlacement[], gridSize: number): boolean {
  const size = shipSize(candidate.shipId);
  if (!size) return false;
  const taken = new Set(others
    .filter(p => p.shipId !== candidate.shipId)
    .flatMap(p => shipCells(p, shipSize(p.shipId)))
    .map(c => `${c.row},${c.col}`));
  return shipCells(candidate, size).every(c =>
    Number.isInteger(c.row) && Number.isInteger(c.col)
    && c.row >= 0 && c.row < gridSize && c.col >= 0 && c.col < gridSize
    && !taken.has(`${c.row},${c.col}`));
}

/** Why a full fleet is invalid, or null if it's fine. */
export function fleetError(placements: ShipPlacement[], gridSize: number): string | null {
  if (!Array.isArray(placements) || placements.length !== SHIPS.length) return `Place all ${SHIPS.length} ships`;
  const ids = new Set(placements.map(p => p?.shipId));
  if (ids.size !== SHIPS.length || SHIPS.some(s => !ids.has(s.id))) return 'Each ship must be placed once';
  for (const p of placements) {
    if (p.direction !== 'horizontal' && p.direction !== 'vertical') return 'Invalid direction';
    if (!fitsOnBoard(p, placements, gridSize)) return `${SHIPS.find(s => s.id === p.shipId)?.name ?? 'A ship'} doesn't fit there`;
  }
  return null;
}

/** A random legal fleet. */
export function randomFleet(gridSize: number): ShipPlacement[] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const placed: ShipPlacement[] = [];
    for (const ship of SHIPS) {
      for (let tries = 0; tries < 200; tries++) {
        const direction: Direction = Math.random() < 0.5 ? 'horizontal' : 'vertical';
        const maxRow = direction === 'vertical' ? gridSize - ship.size : gridSize - 1;
        const maxCol = direction === 'horizontal' ? gridSize - ship.size : gridSize - 1;
        const candidate: ShipPlacement = {
          shipId: ship.id,
          start: { row: Math.floor(Math.random() * (maxRow + 1)), col: Math.floor(Math.random() * (maxCol + 1)) },
          direction,
        };
        if (fitsOnBoard(candidate, placed, gridSize)) {
          placed.push(candidate);
          break;
        }
      }
    }
    if (placed.length === SHIPS.length) return placed;
  }
  // Unreachable on 8×8 and 10×10 boards, but always return something legal
  return SHIPS.map((ship, i) => ({ shipId: ship.id, start: { row: i * 2, col: 0 }, direction: 'horizontal' as const }));
}

/** Keep a 2×2 sonar area fully on the board. */
export function clampSonar(topLeft: Coordinate, gridSize: number): Coordinate {
  return {
    row: Math.min(Math.max(0, Math.floor(topLeft.row)), gridSize - 2),
    col: Math.min(Math.max(0, Math.floor(topLeft.col)), gridSize - 2),
  };
}
