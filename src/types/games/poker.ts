// ============================================
// Poker (Texas Hold'em) — Shared game types & constants
// ============================================

// ---- Phases ----

export type PokerPhase =
  | 'dealing'       // hole cards dealt + blinds posted, deal animation plays
  | 'preflop'       // first betting round (after hole cards)
  | 'flop'          // second betting round (3 community cards)
  | 'turn'          // third betting round (4th community card)
  | 'river'         // final betting round (5th community card)
  | 'roundEnd'      // pot awarded (showdown or uncontested), next hand auto-deals
  | 'finished';     // game over, one player has all chips

export const BETTING_PHASES: readonly PokerPhase[] = ['preflop', 'flop', 'turn', 'river'];

export function isBettingPhase(phase: PokerPhase): boolean {
  return BETTING_PHASES.includes(phase);
}

// ---- Settings ----

export interface PokerSettings {
  maxPlayers: number;              // 2–8
  startingChips: 500 | 1000 | 2000;
  blindStructure: 'slow' | 'normal' | 'fast';  // hands between blind increases
  startingBlinds: '10/20' | '25/50';
  turnTimer: 15 | 30 | 45 | 0;    // seconds, 0 = off
  bountyMode: boolean;             // show knockouts on seats + credit eliminations
}

export const POKER_MIN_PLAYERS = 2;
export const POKER_MAX_PLAYERS = 8;
export const POKER_STARTING_CHIPS = [500, 1000, 2000] as const;
export const POKER_BLIND_STRUCTURES = ['slow', 'normal', 'fast'] as const;
export const POKER_STARTING_BLINDS = ['10/20', '25/50'] as const;
export const POKER_TURN_TIMERS = [15, 30, 45, 0] as const;

export const DEFAULT_POKER_SETTINGS: PokerSettings = {
  maxPlayers: POKER_MAX_PLAYERS,
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

// ---- Pacing (server-driven) ----

export const POKER_DEAL_MS = 1500;               // deal animation before preflop betting opens
export const POKER_RUNOUT_STEP_MS = 1800;        // all-in runout: delay between streets
export const POKER_SHOWDOWN_PAUSE_MS = 7000;     // time to read the showdown before the next hand
export const POKER_UNCONTESTED_PAUSE_MS = 3500;  // everyone folded — shorter pause
export const POKER_AWAY_GRACE_S = 10;            // disconnected player's first turn: grace before auto-action
export const POKER_AWAY_REPEAT_S = 3;            // later turns while still away (already auto-acted once)

// ---- Reactions ----

export const POKER_REACTIONS = ['😤', '😎', '🤔', '😂', '💀', '🔥'] as const;
export type PokerReactionEmoji = typeof POKER_REACTIONS[number];

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

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

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
  bestCards: Card[];         // the cards making the hand (5 once the flop is out, 2 preflop)
  kickers: number[];         // tiebreaker values (descending)
  description: string;       // e.g. "Two Pair, Kings & Sevens"
}

// ---- Betting Actions ----

/** Actions a player can send */
export type BettingAction = 'fold' | 'check' | 'call' | 'raise' | 'allIn';

/** Everything that can appear in the hand log (adds forced blinds + opening bets) */
export type LoggedAction = BettingAction | 'bet' | 'smallBlind' | 'bigBlind';

export interface ActionHistoryEntry {
  playerId: string;
  playerName: string;
  action: LoggedAction;
  amount: number;            // chips added by this action (0 for fold/check)
  totalBet: number;          // player's bet on this street after the action ("raise to")
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
  currentBet: number;        // chips in front of the player this street
  totalBetThisHand: number;  // total invested this hand
  folded: boolean;
  allIn: boolean;
  alive: boolean;            // still in the tournament (has chips)
  inHand: boolean;           // dealt into the current hand
  connected: boolean;
  left: boolean;             // left the room for good (out of the tournament)
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  holeCards: Card[] | null;  // others' cards: only once tabled (all-in runout or showdown)
  knockouts: number;         // players this player has eliminated
  potsWon: number;           // pots won so far this tournament
}

export interface PokerTurnTimer {
  playerId: string;
  secondsLeft: number;
  total: number;
}

export interface ShowdownHand {
  playerId: string;
  playerName: string;
  avatar: string;
  holeCards: Card[];
  handEvaluation: HandEvaluation;
  amountWon: number;
  isWinner: boolean;
}

export interface PokerHandResult {
  uncontested: boolean;       // everyone else folded — nobody shows cards
  potTotal: number;
  winners: {
    playerId: string;
    playerName: string;
    avatar: string;
    amount: number;
    handDescription: string | null;   // null when uncontested
  }[];
  hands: ShowdownHand[];      // tabled hands, best first (empty when uncontested)
  winningCards: Card[];       // best winning 5-card hand, for highlighting the board
}

export interface PokerEliminationInfo {
  id: string;
  name: string;
  avatar: string;
  place: number;              // finishing position (1 = winner)
  eliminatedBy: string | null; // name of the player who won the deciding pot
  left: boolean;              // left the room instead of busting
}

export interface PokerClientState {
  phase: PokerPhase;
  handNumber: number;
  players: PokerPlayerInfo[];          // seating order (clockwise)
  myCards: Card[];                     // your hole cards (always visible to you)
  myHand: HandEvaluation | null;       // your live best hand (preflop: hole card summary)
  communityCards: Card[];              // revealed community cards
  pots: Pot[];                         // main pot + side pots (includes this street's bets)
  potTotal: number;
  currentBet: number;                  // highest bet this street
  activePlayerId: string | null;       // whose turn it is
  isMyTurn: boolean;
  amIAlive: boolean;                   // whether you're still in the tournament
  callAmount: number;                  // chips needed to call (capped at your stack)
  minRaiseTo: number;                  // smallest legal "raise to" total
  maxRaiseTo: number;                  // your all-in "raise to" total
  canRaise: boolean;                   // you can raise and someone could still respond
  smallBlind: number;
  bigBlind: number;
  blindsUp: boolean;                   // first hand at a new blind level
  nextBlindIncrease: number | null;    // hands until blinds go up (null at the top level)
  runout: boolean;                     // all-in: remaining cards are dealt with hands tabled
  actionHistory: ActionHistoryEntry[];
  handResult: PokerHandResult | null;  // set during roundEnd
  nextHandInMs: number | null;         // during roundEnd: time until the next deal
  eliminationOrder: PokerEliminationInfo[];  // first eliminated → last
  winnerId: string | null;             // tournament winner (finished only)
  superlatives: PokerSuperlative[];    // end-of-game awards (finished only)
  settings: PokerSettings;
}

// ---- Server State (authoritative, never sent to clients) ----

export interface PokerPlayerState {
  holeCards: Card[];
  chips: number;
  currentBet: number;
  totalBetThisHand: number;
  folded: boolean;
  allIn: boolean;
  alive: boolean;                      // still in tournament
  left: boolean;                       // left the room for good (counts as out)
  inHand: boolean;                     // dealt into the current hand
  stackAtHandStart: number;            // tiebreak for same-hand eliminations
}

export interface PokerServerHandResult {
  uncontested: boolean;
  potTotal: number;
  pots: { amount: number; eligiblePlayerIds: string[]; winnerIds: string[] }[];
  winnings: Record<string, number>;
  hands: { playerId: string; holeCards: Card[]; evaluation: HandEvaluation }[];
  winningCards: Card[];
}

export interface PokerServerState {
  phase: PokerPhase;
  deck: Card[];                        // remaining cards in deck
  communityCards: Card[];              // all 5 (dealt up front, revealed progressively)
  revealedCommunityCount: number;      // how many are visible (0, 3, 4, 5)
  playerData: Record<string, PokerPlayerState>;
  names: Record<string, { name: string; avatar: string }>;  // snapshot so departed players keep a label
  seatingOrder: string[];              // all player IDs, fixed clockwise order
  dealerId: string;
  smallBlindId: string;
  bigBlindId: string;
  activePlayerId: string | null;       // whose turn it is (null outside betting)
  currentBet: number;                  // highest bet this street
  minRaise: number;                    // minimum raise increment (last full raise)
  actedThisRound: Set<string>;         // players who acted since the last full raise
  runout: boolean;                     // betting closed with cards still to come
  actionHistory: ActionHistoryEntry[];
  handNumber: number;
  blindLevel: number;                  // index into BLIND_LEVELS
  handsAtCurrentLevel: number;         // hands played at this blind level
  settings: PokerSettings;
  eliminationOrder: { id: string; eliminatedBy: string | null }[];  // first eliminated → last
  handResult: PokerServerHandResult | null;
  // Pacing (owned by the socket driver)
  turnTimerEnd: number | null;
  turnTimerTotal: number;
  turnTimerPlayerId: string | null;
  nextHandAt: number | null;
  autoActed: Set<string>;              // away players already auto-acted once (shorter grace)
  // Stats tracking for superlatives
  stats: {
    biggestPot: { amount: number; winnerId: string | null };
    handsPlayed: Record<string, number>;       // playerId → hands dealt in
    handsWon: Record<string, number>;          // playerId → pots won
    bluffsWon: Record<string, number>;         // playerId → uncontested pots taken with nothing
    eliminations: Record<string, number>;      // playerId → players eliminated
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
