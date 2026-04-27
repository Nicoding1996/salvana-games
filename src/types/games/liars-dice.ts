// ============================================
// Liar's Dice — Shared game types & constants
// ============================================

// ---- Phases ----

export type LiarsDicePhase =
  | 'rolling'       // dice roll animation + shake
  | 'bidding'       // active turn-based bidding
  | 'challenge'     // liar/spot-on called, brief pause
  | 'reveal'        // all dice shown, result calculated
  | 'roundEnd'      // show who lost a life, elimination
  | 'finished';     // game over, winner declared

// ---- Settings ----

export interface LiarsDiceSettings {
  maxPlayers: number;          // 2–6
  lives: 2 | 3;
  wildOnes: boolean;
  spotOn: boolean;
  turnTimer: 15 | 30 | 45 | 0; // seconds, 0 = off
}

export const DEFAULT_LIARS_DICE_SETTINGS: LiarsDiceSettings = {
  maxPlayers: 4,
  lives: 2,
  wildOnes: false,
  spotOn: false,
  turnTimer: 30,
};

// ---- Bid History Entry ----

export interface BidHistoryEntry {
  playerId: string;
  playerName: string;
  playerAvatar: string;
  quantity: number;
  faceValue: number;
  type: 'bid' | 'liar' | 'spotOn';
}

// ---- Challenge Result ----

export interface ChallengeResult {
  type: 'liar' | 'spotOn';
  callerId: string;
  callerName: string;
  bidderId: string;
  bidderName: string;
  bid: { quantity: number; faceValue: number };
  actualCount: number;
  allDice: Record<string, number[]>;   // everyone's dice revealed
  loserId: string;
  loserName: string;
  losersIfSpotOn: string[] | null;     // all losers for spot-on (null if liar call)
  wasCorrect: boolean;                 // was the challenge call correct?
}

// ---- Client State (personalized per player) ----

export interface LiarsDicePlayerInfo {
  id: string;
  name: string;
  avatar: string;
  lives: number;
  maxLives: number;
  alive: boolean;
  connected: boolean;
  diceCount: number;
  dice: number[] | null;               // only populated during reveal phase
}

export interface LiarsDiceClientState {
  phase: LiarsDicePhase;
  players: LiarsDicePlayerInfo[];
  myDice: number[];
  currentBid: { quantity: number; faceValue: number; playerName: string; playerId: string } | null;
  activePlayerId: string | null;
  isMyTurn: boolean;
  bidHistory: BidHistoryEntry[];
  roundNumber: number;
  lastChallengeResult: ChallengeResult | null;
  settings: LiarsDiceSettings;
  eliminationOrder: { id: string; name: string; avatar: string }[];
  totalDiceOnTable: number;
  isFirstRound: boolean;
}

// ---- Server State (authoritative, never sent to clients) ----

export interface LiarsDiceServerState {
  phase: LiarsDicePhase;
  playerData: Record<string, {
    dice: number[];
    lives: number;
    alive: boolean;
  }>;
  seatingOrder: string[];              // all player IDs in original order
  aliveOrder: string[];                // only alive players, in turn order
  currentPlayerIndex: number;          // index into aliveOrder
  currentBid: { quantity: number; faceValue: number; playerId: string } | null;
  bidHistory: BidHistoryEntry[];
  roundNumber: number;
  settings: LiarsDiceSettings;
  eliminationOrder: string[];          // player IDs, first eliminated → last
  turnTimerEnd: number | null;
  challengeResult: ChallengeResult | null;
  rollsReceived: Set<string>;          // players who finished rolling
}

// ---- Constants ----

export const DICE_FACES = [1, 2, 3, 4, 5, 6] as const;

export const DIE_FACE_LABELS: Record<number, string> = {
  1: '⚀',
  2: '⚁',
  3: '⚂',
  4: '⚃',
  5: '⚄',
  6: '⚅',
};

export const LIVES_DISPLAY = {
  full: '❤️',
  lost: '🖤',
} as const;
