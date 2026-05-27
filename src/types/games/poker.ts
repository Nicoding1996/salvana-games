// ============================================
// Poker (Texas Hold'em) — Shared game types & constants
// ============================================

// ---- Phases ----

export type PokerPhase =
  | 'dealing'       // cards being dealt, squeeze animation
  | 'preflop'       // first betting round (after hole cards)
  | 'flop'          // second betting round (3 community cards)
  | 'turn'          // third betting round (4th community card)
  | 'river'         // final betting round (5th community card)
  | 'showdown'      // reveal hands, determine winner
  | 'roundEnd'      // show results, award pot, check eliminations
  | 'finished';     // game over, one player has all chips

// ---- Settings ----

export interface PokerSettings {
  maxPlayers: number;              // 2–8
  startingChips: 500 | 1000 | 2000;
  blindStructure: 'slow' | 'normal' | 'fast';  // hands between blind increases
  startingBlinds: '10/20' | '25/50';
  turnTimer: 15 | 30 | 45 | 0;    // seconds, 0 = off
  bountyMode: boolean;             // track eliminations as bounties
}

export const DEFAULT_POKER_SETTINGS: PokerSettings = {
  maxPlayers: 6,
  startingChips: 1000,
  blindStructure: 'normal',
  startingBlinds: '10/20',
  turnTimer: 30,
  bountyMode: false,
};

// Blind levels — small blind values, big blind is always 2x
export const BLIND_LEVELS = [10, 25, 50, 100, 150, 200, 300, 500, 750, 1000] as const;

// Hands between blind increases per structure
export const BLIND_INCREASE_HANDS: Record<PokerSettings['blindStructure'], number> = {
  slow: 8,
  normal: 5,
  fast: 3,
};

// ---- Card Types ----

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// ---- Hand Rankings ----

export type HandRank =
  | 'royal-flush'
  | 'straight-flush'
  | 'four-of-a-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'two-pair'
  | 'one-pair'
  | 'high-card';

export const HAND_RANK_ORDER: HandRank[] = [
  'high-card',
  'one-pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
  'royal-flush',
];

export const HAND_RANK_NAMES: Record<HandRank, string> = {
  'royal-flush': 'Royal Flush',
  'straight-flush': 'Straight Flush',
  'four-of-a-kind': 'Four of a Kind',
  'full-house': 'Full House',
  'flush': 'Flush',
  'straight': 'Straight',
  'three-of-a-kind': 'Three of a Kind',
  'two-pair': 'Two Pair',
  'one-pair': 'One Pair',
  'high-card': 'High Card',
};

export interface HandEvaluation {
  rank: HandRank;
  rankIndex: number;        // 0 (high-card) to 9 (royal-flush)
  bestCards: Card[];         // the 5 cards making the best hand
  kickers: number[];         // tiebreaker values (descending)
  description: string;       // e.g. "Two Pair, Kings & Sevens"
}

// ---- Betting Actions ----

export type BettingAction = 'fold' | 'check' | 'call' | 'raise' | 'allIn';

export interface ActionHistoryEntry {
  playerId: string;
  playerName: string;
  action: BettingAction;
  amount: number;            // 0 for fold/check
  phase: PokerPhase;
}

// ---- Pot & Side Pots ----

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];  // players who can win this pot
}

// ---- Client State (personalized per player) ----

export interface PokerPlayerInfo {
  id: string;
  name: string;
  avatar: string;
  chips: number;
  currentBet: number;        // bet in current round
  totalBetThisHand: number;  // total invested this hand
  folded: boolean;
  allIn: boolean;
  alive: boolean;            // still in the tournament (has chips)
  connected: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  holeCards: Card[] | null;  // only shown during showdown (for others)
  handDescription: string | null;  // only during showdown
  isWinner: boolean;
}

export interface PokerClientState {
  phase: PokerPhase;
  players: PokerPlayerInfo[];
  myCards: Card[];                    // your hole cards (always visible to you)
  communityCards: Card[];             // revealed community cards
  pots: Pot[];                        // main pot + side pots
  currentBet: number;                 // highest bet in current round
  activePlayerId: string | null;      // whose turn it is
  isMyTurn: boolean;
  amIAlive: boolean;                  // whether the current player is still in the tournament
  minRaise: number;                   // minimum raise amount
  callAmount: number;                 // how much to call (0 if can check)
  handNumber: number;
  blindLevel: number;                 // current small blind value
  nextBlindIncrease: number;          // hands until next increase
  actionHistory: ActionHistoryEntry[];
  lastShowdown: ShowdownResult | null;
  eliminationOrder: { id: string; name: string; avatar: string }[];
  settings: PokerSettings;
  isFirstHand: boolean;
  myHandStrength: HandEvaluation | null;  // live hand evaluation for helper
}

// ---- Showdown Result ----

export interface ShowdownPlayerResult {
  playerId: string;
  playerName: string;
  avatar: string;
  holeCards: Card[];
  handEvaluation: HandEvaluation;
  potWon: number;
  isWinner: boolean;
}

export interface ShowdownResult {
  players: ShowdownPlayerResult[];
  communityCards: Card[];
  pots: Pot[];
  winners: { playerId: string; playerName: string; amount: number }[];
}

// ---- Server State (authoritative, never sent to clients) ----

export interface PokerServerState {
  phase: PokerPhase;
  deck: Card[];                        // remaining cards in deck
  communityCards: Card[];              // all 5 (dealt progressively)
  revealedCommunityCount: number;      // how many are visible (0, 3, 4, 5)
  playerData: Record<string, {
    holeCards: Card[];
    chips: number;
    currentBet: number;
    totalBetThisHand: number;
    folded: boolean;
    allIn: boolean;
    alive: boolean;                    // still in tournament
  }>;
  seatingOrder: string[];              // all player IDs in original order
  aliveOrder: string[];                // players still in tournament
  dealerIndex: number;                 // index into aliveOrder for dealer button
  currentPlayerIndex: number;          // index into active betting order
  bettingOrder: string[];              // order for current betting round
  currentBet: number;                  // highest bet this round
  minRaise: number;                    // minimum raise increment
  lastRaiser: string | null;           // who last raised (for action-closes-at logic)
  actedThisRound: Set<string>;         // players who have acted since last raise (or round start)
  pots: Pot[];
  actionHistory: ActionHistoryEntry[];
  handNumber: number;
  blindLevel: number;                  // index into BLIND_LEVELS
  handsAtCurrentLevel: number;         // hands played at this blind level
  settings: PokerSettings;
  eliminationOrder: string[];          // player IDs, first eliminated → last
  turnTimerEnd: number | null;
  lastShowdown: ShowdownResult | null;
  // Stats tracking for superlatives
  stats: {
    biggestPot: { amount: number; winnerId: string | null };
    handsPlayed: Record<string, number>;       // playerId → hands participated
    handsWon: Record<string, number>;          // playerId → hands won
    bluffsWon: Record<string, number>;         // playerId → pots won without best hand
    eliminations: Record<string, number>;      // playerId → players eliminated
    biggestAllIn: { amount: number; playerId: string | null };
    foldCount: Record<string, number>;         // playerId → times folded
  };
}

// ---- Game Over Superlatives ----

export interface PokerSuperlative {
  emoji: string;
  title: string;
  playerId: string;
  playerName: string;
  value: string;
}

// ---- Constants ----

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const CARDS_PER_PLAYER = 2;
export const COMMUNITY_CARD_COUNT = 5;
export const BURN_CARDS = 3;  // one before flop, turn, river
