// ============================================
// Liar's Dice — Shared game types & constants
// ============================================

// ---- Phases ----

export type LiarsDicePhase =
  | 'rolling'       // everyone shakes / taps to roll; auto-advances
  | 'bidding'       // turn-based bidding
  | 'challenge'     // LIAR or SPOT ON called: every die is revealed
  | 'roundEnd'      // lives updated, short pause before the next roll
  | 'finished';     // one player left

// ---- Settings ----

export interface LiarsDiceSettings {
  maxPlayers: number;          // 2–6
  lives: 2 | 3;
  wildOnes: boolean;
  spotOn: boolean;
  turnTimer: 15 | 30 | 45 | 0; // seconds, 0 = off
}

export const DEFAULT_LIARS_DICE_SETTINGS: LiarsDiceSettings = {
  maxPlayers: 6,
  lives: 2,
  wildOnes: false,
  spotOn: false,
  turnTimer: 30,
};

// ---- Bids ----

export interface Bid {
  quantity: number;
  faceValue: number;
}

export interface BidHistoryEntry {
  playerId: string;
  playerName: string;
  playerAvatar: string;
  quantity: number;
  faceValue: number;
  type: 'bid' | 'liar' | 'spotOn';
  auto?: boolean;              // made by the server: turn timer ran out or the player was away
}

// ---- Challenge Result ----

export interface ChallengeResult {
  type: 'liar' | 'spotOn';
  callerId: string;
  callerName: string;
  bidderId: string;
  bidderName: string;
  bid: Bid;
  actualCount: number;
  allDice: Record<string, number[]>;   // everyone's dice this round, revealed
  loserIds: string[];                  // who loses a ❤️ (everyone else after a correct SPOT ON)
  wasCorrect: boolean;                 // the caller was right
  auto: boolean;                       // called by the server for a player who ran out of time
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
  rolled: boolean;             // finished rolling this round
  left: boolean;               // left the game for good
}

export interface LiarsDiceStats {
  calls: number;               // LIAR / SPOT ON calls made
  correctCalls: number;
  caught: number;              // their bid was called and it was false
  spotOnHits: number;
}

export interface LiarsDiceClientState {
  phase: LiarsDicePhase;
  players: LiarsDicePlayerInfo[];      // seating = turn order
  myDice: number[];
  currentBid: (Bid & { playerId: string; playerName: string }) | null;
  activePlayerId: string | null;
  isMyTurn: boolean;
  bidHistory: BidHistoryEntry[];
  roundNumber: number;
  lastChallengeResult: ChallengeResult | null;
  settings: LiarsDiceSettings;
  eliminationOrder: string[];          // player ids, first out → last out
  totalDiceOnTable: number;
  stats: Record<string, LiarsDiceStats>;
  winnerId: string | null;
}

/** Clock of the player whose turn it is. Sent as null when no clock is running. */
export interface LiarsDiceTurnTimer {
  playerId: string;
  secondsLeft: number;
  total: number;
}

// ---- Server State (authoritative, never sent to clients) ----

export interface LiarsDiceServerState {
  phase: LiarsDicePhase;
  playerData: Record<string, {
    name: string;                      // kept so players who leave still show up in the standings
    avatar: string;
    dice: number[];
    lives: number;
    alive: boolean;
    left: boolean;
  }>;
  seatingOrder: string[];              // everyone, in turn order
  roundPlayers: string[];              // whose dice are on the table this round
  activePlayerId: string | null;
  currentBid: (Bid & { playerId: string }) | null;
  bidHistory: BidHistoryEntry[];
  roundNumber: number;
  settings: LiarsDiceSettings;
  eliminationOrder: string[];
  challengeResult: ChallengeResult | null;
  rollsReceived: Set<string>;
  stats: Record<string, LiarsDiceStats>;
  winnerId: string | null;
  turnTimerEnd: number | null;
  turnTimerTotal: number;
  turnTimerPlayerId: string | null;
}

// ---- Constants ----

export const DICE_PER_PLAYER = 5;
export const LIARS_DICE_MIN_PLAYERS = 2;
export const LIARS_DICE_MAX_PLAYERS = 6;

/** Rolling phase length (everyone who rolled earlier moves it on sooner) */
export const LD_ROLL_MS = 5000;
/** Phones auto-roll for anyone who hasn't shaken or tapped by now */
export const LD_AUTO_ROLL_MS = 3800;
/** Dice stay revealed this long after a call */
export const LD_REVEAL_MS = 8000;
/** Lives updated, pause before the next roll */
export const LD_ROUND_END_MS = 3500;
/** An offline player's turn is played for them after this long */
export const LD_AWAY_GRACE_S = 10;
/** Reveal animation: intro, then one player's dice every LD_REVEAL_ROW_MS */
export const LD_REVEAL_INTRO_MS = 900;
export const LD_REVEAL_ROW_MS = 450;

// ---- Rules (shared by the server's validation and the client's bid builder) ----

/** A raise needs more dice, or the same number of dice showing a higher face. */
export function isValidRaise(prev: Bid | null, next: Bid): boolean {
  if (!prev) return true;
  if (next.quantity > prev.quantity) return true;
  return next.quantity === prev.quantity && next.faceValue > prev.faceValue;
}

/** Smallest legal quantity for a face, given the bid on the table. */
export function minQuantityFor(prev: Bid | null, faceValue: number): number {
  if (!prev) return 1;
  return faceValue > prev.faceValue ? prev.quantity : prev.quantity + 1;
}

/** Dice that count for a face. With wild ones, 1s count for every other face. */
export function countMatches(dice: readonly number[], faceValue: number, wildOnes: boolean): number {
  let count = 0;
  for (const d of dice) {
    if (d === faceValue || (wildOnes && d === 1 && faceValue !== 1)) count++;
  }
  return count;
}
