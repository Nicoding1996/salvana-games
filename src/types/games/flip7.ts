// ============================================
// Flip 7 — Shared game types & constants
// ============================================

// ---- Phases ----

export type Flip7Phase =
  | 'dealing'      // initial card deal animation
  | 'playing'      // active turn-based play (or simultaneous in Chaos)
  | 'roundEnd'     // scores shown, waiting for next round
  | 'finished';    // game over, winner declared

// ---- Card Types ----

export type CardType = 'number' | 'action' | 'modifier';
export type ActionCardKind = 'freeze' | 'flipThree' | 'secondChance';
export type ModifierCardKind = 'plus2' | 'plus4' | 'times2';

export interface NumberCard {
  type: 'number';
  value: number;  // 0–12
}

export interface ActionCard {
  type: 'action';
  kind: ActionCardKind;
}

export interface ModifierCard {
  type: 'modifier';
  kind: ModifierCardKind;
}

export type Card = NumberCard | ActionCard | ModifierCard;

// ---- Settings ----

export interface Flip7Settings {
  maxPlayers: number;              // 3–10
  targetScore: 100 | 200 | 300;
  turnTimer: 10 | 15 | 30 | 0;    // seconds, 0 = off
  mode: 'classic' | 'chaos';
}

export const DEFAULT_FLIP7_SETTINGS: Flip7Settings = {
  maxPlayers: 8,
  targetScore: 200,
  turnTimer: 15,
  mode: 'classic',
};

// ---- Player Status ----

export type PlayerRoundStatus = 'active' | 'stayed' | 'busted' | 'frozen';

// ---- Pending Action (waiting for player to choose target) ----

export interface PendingAction {
  cardKind: 'freeze' | 'flipThree';
  drawerId: string;
  eligibleTargets: string[];  // player IDs who can be targeted
}

// ---- Pending Modifier Choice ----

export interface PendingModifier {
  cardKind: ModifierCardKind;
  drawerId: string;
  eligibleTargets: string[];  // player IDs who can receive it
}

// ---- Activity Log Entry ----

export interface ActivityLogEntry {
  playerId: string;
  playerName: string;
  card: Card | null;
  result: 'safe' | 'bust' | 'secondChance' | 'stayed' | 'frozen';
  timestamp: number;
}

// ---- Client State (personalized per player) ----

export interface Flip7PlayerInfo {
  id: string;
  name: string;
  avatar: string;
  connected: boolean;
  roundStatus: PlayerRoundStatus;
  cardCount: number;           // how many number cards they have
  visibleCards: number[];      // actual card values (all cards are face-up in Flip 7)
  bustCard: number | null;     // the duplicate value that caused bust (shown with red highlight)
  hasSecondChance: boolean;
  modifiers: ModifierCardKind[];
  cumulativeScore: number;
  roundScore: number;          // only populated at roundEnd
}

export interface Flip7ClientState {
  phase: Flip7Phase;
  players: Flip7PlayerInfo[];
  myCards: NumberCard[];                // my number cards (visible to me)
  myModifiers: ModifierCardKind[];     // my modifier cards
  mySecondChances: number;             // count of Second Chance cards held
  myRoundStatus: PlayerRoundStatus;
  activePlayerId: string | null;       // whose turn (null in chaos mode tick)
  isMyTurn: boolean;
  deckRemaining: number;
  round: number;
  dealerIndex: number;
  settings: Flip7Settings;
  pendingAction: PendingAction | null;       // waiting for target selection
  pendingModifier: PendingModifier | null;   // waiting for keep/give choice
  lastFlip: {
    playerId: string;
    playerName: string;
    card: Card;
    result: 'safe' | 'bust' | 'secondChance';
  } | null;
  roundScores: {
    playerId: string;
    playerName: string;
    roundScore: number;
    cumulativeScore: number;
    busted: boolean;
  }[] | null;
  winnerId: string | null;
  activityLog: ActivityLogEntry[];     // recent flips for live feed
  flipSevenAchievedBy: string | null;  // player ID who got Flip 7 this round
}

// ---- Server State (authoritative, never sent to clients directly) ----

export interface Flip7ServerPlayerData {
  numberCards: NumberCard[];
  modifiers: ModifierCardKind[];
  secondChances: number;
  roundStatus: PlayerRoundStatus;
  bustCard: NumberCard | null;  // the duplicate card that caused the bust
}

export interface Flip7ServerState {
  phase: Flip7Phase;
  deck: Card[];
  discardPile: Card[];
  playerData: Record<string, Flip7ServerPlayerData>;
  turnOrder: string[];              // all player IDs in seating order
  currentPlayerIndex: number;       // index into turnOrder (classic mode)
  dealerIndex: number;
  round: number;
  cumulativeScores: Record<string, number>;
  settings: Flip7Settings;
  turnTimerEnd: number | null;
  pendingAction: PendingAction | null;
  pendingModifier: PendingModifier | null;
  activityLog: ActivityLogEntry[];
  flipSevenAchievedBy: string | null;
  // Chaos mode
  chaosChoices: Record<string, 'hit' | 'stay'> | null;
  // Last round scores (for getClientState during roundEnd)
  lastRoundScores: { playerId: string; roundScore: number; cumulativeScore: number; busted: boolean }[] | null;
  lastWinnerId: string | null;
}

// ---- Deck Construction Constants ----

export const DECK_COMPOSITION = {
  numbers: [
    { value: 0, count: 1 },
    { value: 1, count: 1 },
    { value: 2, count: 2 },
    { value: 3, count: 3 },
    { value: 4, count: 4 },
    { value: 5, count: 5 },
    { value: 6, count: 6 },
    { value: 7, count: 7 },
    { value: 8, count: 8 },
    { value: 9, count: 9 },
    { value: 10, count: 10 },
    { value: 11, count: 11 },
    { value: 12, count: 12 },
  ],
  actions: [
    { kind: 'freeze' as const, count: 2 },
    { kind: 'flipThree' as const, count: 2 },
    { kind: 'secondChance' as const, count: 2 },
  ],
  modifiers: [
    { kind: 'plus2' as const, count: 3 },
    { kind: 'plus4' as const, count: 3 },
    { kind: 'times2' as const, count: 3 },
  ],
} as const;

export const TOTAL_DECK_SIZE = 94; // 79 + 6 + 9
export const CHAOS_DECK_SIZE = 90; // 79 + 2 (secondChance only) + 9

// ---- Scoring Constants ----

export const FLIP_7_BONUS = 15;
export const FLIP_7_CARD_COUNT = 7;

// ---- Timer Constants ----

export const DISCONNECT_GRACE_MS = 10_000;   // 10s grace before auto-stay
export const ACTION_TIMEOUT_MS = 15_000;     // 15s fallback if no turn timer
export const ROUND_END_DISPLAY_MS = 4_000;   // 4s round summary display
export const DEAL_ANIMATION_MS = 2_000;      // 2s deal animation

// ---- Flip Animation Timing ----
// How long each flipped card stays on screen (client overlay), and the gap
// between consecutive cards in a multi-card sequence (e.g. Flip Three).
// Shared so the server can delay the round-end transition long enough for the
// full client-side flip animation to finish before showing the summary.
export const FLIP_CARD_DISPLAY_MS = 1_500;   // safe / secondChance card
export const FLIP_BUST_DISPLAY_MS = 2_500;   // bust card (longer to register)
export const FLIP_CARD_GAP_MS = 180;         // gap between consecutive cards

// Total time to animate a sequence of flip results, including inter-card gaps.
// Used to size the round-end delay so animations never spill over the summary.
export function flipSequenceDurationMs(
  results: { result: 'safe' | 'bust' | 'secondChance' }[]
): number {
  if (results.length === 0) return 0;
  const cards = results.reduce(
    (sum, r) => sum + (r.result === 'bust' ? FLIP_BUST_DISPLAY_MS : FLIP_CARD_DISPLAY_MS),
    0
  );
  const gaps = (results.length - 1) * FLIP_CARD_GAP_MS;
  return cards + gaps;
}

// ---- Card Display Labels ----

export const ACTION_CARD_LABELS: Record<ActionCardKind, { name: string; icon: string; color: string }> = {
  freeze: { name: 'Freeze', icon: '❄️', color: '#60a5fa' },
  flipThree: { name: 'Flip Three', icon: '⚡', color: '#fbbf24' },
  secondChance: { name: 'Second Chance', icon: '💚', color: '#4ade80' },
};

export const MODIFIER_CARD_LABELS: Record<ModifierCardKind, { name: string; display: string; color: string }> = {
  plus2: { name: '+2', display: '+2', color: '#a3e635' },
  plus4: { name: '+4', display: '+4', color: '#a3e635' },
  times2: { name: '×2', display: '×2', color: '#f472b6' },
};
