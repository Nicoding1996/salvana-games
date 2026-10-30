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

/** Outcome of a single flipped card for the player who received it. */
export type FlipResult = 'safe' | 'bust' | 'secondChance';

// ---- Settings ----

export interface Flip7Settings {
  maxPlayers: number;              // 3–10
  targetScore: 100 | 200 | 300;
  turnTimer: 10 | 15 | 30 | 0;    // seconds, 0 = off
  mode: 'classic' | 'chaos';
}

// The lobby has no max-player control, so the cap defaults to the most the game supports.
export const DEFAULT_FLIP7_SETTINGS: Flip7Settings = {
  maxPlayers: 10,
  targetScore: 200,
  turnTimer: 15,
  mode: 'classic',
};

export const FLIP7_TARGET_SCORES = [100, 200, 300] as const;
export const FLIP7_TURN_TIMERS = [10, 15, 30, 0] as const;
export const FLIP7_MIN_PLAYERS = 3;
export const FLIP7_MAX_PLAYERS = 10;

// ---- Player Status ----

export type PlayerRoundStatus = 'active' | 'stayed' | 'busted' | 'frozen';

// ---- Pending Action (drawer is choosing a Freeze / Flip Three target) ----

export interface PendingAction {
  cardKind: 'freeze' | 'flipThree';
  drawerId: string;
  eligibleTargets: string[];  // player IDs who can be targeted (includes the drawer)
}

// ---- Activity Log Entry ----

export interface ActivityLogEntry {
  playerId: string;
  playerName: string;
  card: Card | null;
  result: FlipResult | 'stayed' | 'frozen';
  auto?: boolean;              // stay forced by the turn timer or a disconnect
  timestamp: number;
}

// ---- Round Results ----

export interface Flip7RoundScore {
  playerId: string;
  playerName: string;
  roundScore: number;
  cumulativeScore: number;
  busted: boolean;
  flipSeven: boolean;
}

export interface Flip7RoundHistory {
  round: number;
  scores: { playerId: string; roundScore: number; busted: boolean; flipSeven: boolean }[];
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
}

export interface Flip7ClientState {
  phase: Flip7Phase;
  players: Flip7PlayerInfo[];
  myCards: NumberCard[];                // my number cards (visible to me)
  myModifiers: ModifierCardKind[];     // my modifier cards
  mySecondChances: number;             // count of Second Chance cards held
  myRoundStatus: PlayerRoundStatus;
  myBustChance: number | null;         // 0–1 chance the next card duplicates one of mine (null if not active)
  activePlayerId: string | null;       // whose turn (null in chaos mode)
  isMyTurn: boolean;
  deckRemaining: number;
  round: number;
  settings: Flip7Settings;
  pendingAction: PendingAction | null; // public, so everyone sees who is picking a target
  chaosSubmitted: string[];            // chaos mode: players who locked in a choice this tick
  roundScores: Flip7RoundScore[] | null;
  roundHistory: Flip7RoundHistory[];
  winnerId: string | null;
  activityLog: ActivityLogEntry[];     // recent events (used for "X stayed" toasts)
  flipSevenAchievedBy: string | null;  // first player who got Flip 7 this round
}

// ---- Socket Event Payloads ----

export interface Flip7FlipEvent {
  playerId: string;
  playerName: string;
  card: Card;
  result: FlipResult;
  flipSeven: boolean;          // this card completed 7 unique numbers
}

export interface Flip7ActionEvent {
  type: 'freeze' | 'flipThree';
  byId: string;
  byName: string;
  targetId: string;
  targetName: string;
  auto: boolean;               // target was picked automatically (timer / disconnect)
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
  activityLog: ActivityLogEntry[];
  flipSevenAchievedBy: string | null;
  // Chaos mode
  chaosChoices: Record<string, 'hit' | 'stay'> | null;
  // Players who left the room mid-game. They sit out every remaining round.
  departed: string[];
  // Last round scores (for getClientState during roundEnd)
  lastRoundScores: Omit<Flip7RoundScore, 'playerName'>[] | null;
  lastWinnerId: string | null;
  roundHistory: Flip7RoundHistory[];
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

// ---- Scoring ----

export const FLIP_7_BONUS = 15;
export const FLIP_7_CARD_COUNT = 7;

/**
 * Round score for one hand. Shared by the server (authoritative scoring) and
 * the client (live "+X this round" preview) so the two can never disagree.
 * Order: number cards → ×2 (doubles the number cards only) → +2/+4 → Flip 7 bonus.
 */
export function computeRoundScore(
  numbers: readonly number[],
  modifiers: readonly ModifierCardKind[],
  busted: boolean,
): number {
  if (busted) return 0;
  let score = numbers.reduce((sum, v) => sum + v, 0);
  const times2 = modifiers.filter(m => m === 'times2').length;
  score *= 2 ** times2;
  for (const m of modifiers) {
    if (m === 'plus2') score += 2;
    else if (m === 'plus4') score += 4;
  }
  if (numbers.length >= FLIP_7_CARD_COUNT) score += FLIP_7_BONUS;
  return score;
}

// ---- Timer Constants ----

export const DISCONNECT_GRACE_MS = 10_000;     // grace before a disconnected player is auto-played
export const ACTION_TIMEOUT_MS = 15_000;       // target-pick fallback when the turn timer is off
export const DEAL_ANIMATION_MS = 2_000;        // dealing screen before cards land
export const STAY_ROUND_END_DELAY_MS = 1_500;  // pause after the last stay before the summary
export const NEXT_ROUND_LOCKOUT_MS = 3_000;    // summary stays up this long before the host can advance

// ---- Animation Timing ----
// How long each flipped card stays on screen (client overlay), and the gap
// between consecutive cards in a multi-card sequence (e.g. Flip Three).
// Shared so the server can delay the round-end transition long enough for the
// full client-side animation to finish before showing the summary.
export const FLIP_CARD_DISPLAY_MS = 1_500;   // safe / secondChance card
export const FLIP_BUST_DISPLAY_MS = 2_500;   // bust card (longer to register)
export const FLIP_SEVEN_DISPLAY_MS = 2_800;  // the card that completes Flip 7
export const FLIP_CARD_GAP_MS = 180;         // gap between consecutive cards
export const ACTION_ANIMATION_MS = 1_300;    // Freeze / Flip Three "attack" before its cards flip

export function flipDisplayMs(e: { result: FlipResult; flipSeven?: boolean }): number {
  if (e.flipSeven) return FLIP_SEVEN_DISPLAY_MS;
  return e.result === 'bust' ? FLIP_BUST_DISPLAY_MS : FLIP_CARD_DISPLAY_MS;
}

// Total time to animate a sequence of flip results, including inter-card gaps.
// Used to size the round-end delay so animations never spill over the summary.
export function flipSequenceDurationMs(
  results: { result: FlipResult; flipSeven?: boolean }[]
): number {
  if (results.length === 0) return 0;
  const cards = results.reduce((sum, r) => sum + flipDisplayMs(r), 0);
  const gaps = (results.length - 1) * FLIP_CARD_GAP_MS;
  return cards + gaps;
}

// Chaos mode reveals every simultaneous flip together in one overlay, so a
// tick takes as long as its slowest card plus the small per-card stagger.
export const CHAOS_STAGGER_MS = 90;

export function chaosBatchDurationMs(
  results: { result: FlipResult; flipSeven?: boolean }[]
): number {
  if (results.length === 0) return 0;
  return Math.max(...results.map(flipDisplayMs)) + (results.length - 1) * CHAOS_STAGGER_MS;
}

// ---- Card Display Labels ----
// Colors reference CSS custom properties defined under [data-game="flip-7"].

export const ACTION_CARD_LABELS: Record<ActionCardKind, { name: string; icon: string; color: string; hint: string }> = {
  freeze: { name: 'Freeze', icon: '❄️', color: 'var(--f7-freeze)', hint: 'Banks their points and ends their round' },
  flipThree: { name: 'Flip Three', icon: '⚡', color: 'var(--f7-flip3)', hint: 'They must flip the next 3 cards' },
  secondChance: { name: 'Second Chance', icon: '💚', color: 'var(--f7-second)', hint: 'Saves you from one duplicate' },
};

export const MODIFIER_CARD_LABELS: Record<ModifierCardKind, { name: string; display: string; color: string; hint: string }> = {
  plus2: { name: '+2', display: '+2', color: 'var(--f7-plus)', hint: 'Adds 2 points' },
  plus4: { name: '+4', display: '+4', color: 'var(--f7-plus)', hint: 'Adds 4 points' },
  times2: { name: '×2', display: '×2', color: 'var(--f7-times)', hint: 'Doubles your number cards' },
};
