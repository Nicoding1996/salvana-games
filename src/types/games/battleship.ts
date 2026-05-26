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
  maxPlayers: number;          // 2–4
  gridSize: 7 | 8;
  shotMode: 'salvo' | 'classic'; // salvo = shots equal surviving ships, classic = 1 per turn
  sonarPing: boolean;
  turnTimer: 15 | 30 | 45 | 0;  // seconds, 0 = off
  placementTimer: 30 | 60 | 0;  // seconds, 0 = off
}

export const DEFAULT_BATTLESHIP_SETTINGS: BattleshipSettings = {
  maxPlayers: 4,
  gridSize: 7,
  shotMode: 'salvo',
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
}

export interface BattleshipClientState {
  phase: BattleshipPhase;
  players: BattleshipPlayerInfo[];
  myGrid: CellState[][];           // my ocean grid (ships + incoming hits)
  attackGrids: Record<string, CellState[][]>; // what I know about each opponent's grid
  activePlayerId: string | null;
  isMyTurn: boolean;
  shotsRemaining: number;          // how many shots I have this turn
  currentTurnShots: ShotEntry[];   // shots fired this turn (for animation)
  roundNumber: number;
  settings: BattleshipSettings;
  lastTurnSummary: ShotEntry[] | null; // previous player's shots
  sonarUsed: boolean;              // have I used my sonar this game?
  gridSize: number;
  isFirstRound: boolean;
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
  ships: ServerShipState[];
  placements: ShipPlacement[];
  incomingShots: { coordinate: Coordinate; result: ShotResult }[];
  alive: boolean;
  ready: boolean;
  sonarUsed: boolean;
}

export interface BattleshipServerState {
  phase: BattleshipPhase;
  playerData: Record<string, BattleshipServerPlayerData>;
  turnOrder: string[];             // alive players in turn order
  currentPlayerIndex: number;
  roundNumber: number;
  settings: BattleshipSettings;
  turnTimerEnd: number | null;
  lastTurnShots: ShotEntry[];
  eliminationOrder: string[];
  placementTimerEnd: number | null;
}

// ---- Constants ----

export const GRID_LABELS_COL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const GRID_LABELS_ROW = ['1', '2', '3', '4', '5', '6', '7', '8'];
