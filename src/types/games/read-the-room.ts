// ============================================
// Read the Room — Shared game types & constants
// ============================================

// ---- Phases & roles ----

export type ReadTheRoomPhase =
  | 'clue'       // the Clue-giver picks a Pair and writes a clue
  | 'guess'      // the Active Team turns the shared dial, then locks it in
  | 'call'       // the other teams call left or right of the Needle
  | 'reveal'     // Target shown, points awarded; the host starts the next Round
  | 'waiting'    // between Rounds: no team has 2 players online
  | 'finished';  // game over

export type ReadTheRoomSide = 'left' | 'right';
export type ReadTheRoomRole = 'clueGiver' | 'guesser' | 'opponent' | 'watcher';

// ---- Settings ----

export interface ReadTheRoomSettings {
  targetScore: 5 | 10 | 15;
  guessTimer: 60 | 90 | 120 | 0;   // seconds, 0 = off
}

export const DEFAULT_READ_THE_ROOM_SETTINGS: ReadTheRoomSettings = {
  targetScore: 10,
  guessTimer: 90,
};

export const RTR_TARGET_SCORE_OPTIONS = [5, 10, 15] as const;
export const RTR_GUESS_TIMER_OPTIONS = [60, 90, 120, 0] as const;

// ---- Pairs and Rounds ----

export interface ReadTheRoomPair {
  id: number;
  left: string;    // the 0 end of the Scale
  right: string;   // the 100 end
}

export interface ReadTheRoomCallResult {
  teamId: string;
  pick: ReadTheRoomSide | null;    // null: the team never picked
  correct: boolean;
}

export interface ReadTheRoomRoundResult {
  roundNumber: number;
  teamId: string;
  clueGiverId: string;
  clueGiverName: string;           // kept for the recap if they leave
  pair: ReadTheRoomPair;
  clue: string;
  target: number;
  needle: number;
  points: 0 | 2 | 3 | 4;
  side: ReadTheRoomSide | null;    // where the Target was, seen from the Needle
  calls: ReadTheRoomCallResult[];
  gains: Record<string, number>;   // teamId → points this Round
}

// ---- Client state (personalized per player) ----

export interface ReadTheRoomMember {
  id: string;
  name: string;
  avatar: string;
  connected: boolean;
  left: boolean;
}

export interface ReadTheRoomTeamView {
  id: string;
  name: string;
  color: string;
  score: number;
  members: ReadTheRoomMember[];    // in Clue-giver Order
}

export interface ReadTheRoomCallView {
  teamId: string;
  locked: boolean;
  pick: ReadTheRoomSide | null;    // own team only until the reveal
  pickedById: string | null;       // own team only until the reveal
}

/** Countdown for the phase's pending step. Sent as null when none runs. */
export interface ReadTheRoomTimer {
  kind: 'guess' | 'call' | 'away'; // away: grace for an offline Clue-giver, or for a team with no Guesser online
  secondsLeft: number;
  total: number;
}

export interface ReadTheRoomDial {
  position: number;
  holderId: string | null;
}

export interface ReadTheRoomAward {
  playerIds: string[];             // everyone tied for it
  value: number;                   // points from clues, or whole seconds holding the dial
}

export interface ReadTheRoomAwards {
  mindReader: ReadTheRoomAward | null;
  dialHog: ReadTheRoomAward | null;
}

export interface ReadTheRoomClientState {
  phase: ReadTheRoomPhase;
  settings: ReadTheRoomSettings;
  roundNumber: number;
  teams: ReadTheRoomTeamView[];              // lobby order
  myTeamId: string | null;
  myRole: ReadTheRoomRole;
  activeTeamId: string | null;
  clueGiverId: string | null;
  offeredPairs: ReadTheRoomPair[] | null;    // Clue-giver, `clue` phase only
  target: number | null;                     // Clue-giver until the reveal, everyone from the reveal on
  pair: ReadTheRoomPair | null;              // after the clue
  clue: string | null;
  dial: ReadTheRoomDial;
  calls: ReadTheRoomCallView[];              // calling teams this Round
  timer: ReadTheRoomTimer | null;            // snapshot when sent
  lastResult: ReadTheRoomRoundResult | null; // `reveal` and `finished` only
  revealElapsedMs: number;                   // a phone that arrives mid-reveal skips the staging
  nextUp: { teamId: string; clueGiverId: string } | null;   // `reveal` without a winner
  winnerTeamId: string | null;
  tiedAtTop: boolean;
  waitingTeamIds: string[];                  // `waiting`: teams short of players
  recap: ReadTheRoomRoundResult[];           // `finished` only
  awards: ReadTheRoomAwards | null;          // `finished` only
}

// ---- Server state (authoritative, never sent as-is) ----

export interface ReadTheRoomCallState {
  pick: ReadTheRoomSide | null;
  pickedById: string | null;
  locked: boolean;
}

export interface ReadTheRoomPlayerRecord {
  name: string;                    // kept so players who leave still show up in the recap and awards
  avatar: string;
  teamId: string;
  left: boolean;
}

export interface ReadTheRoomPlayerStats {
  cluePoints: number;              // points their clues earned (Mind Reader)
  holdMs: number;                  // time spent holding the dial (Dial Hog)
}

export interface ReadTheRoomServerState {
  phase: ReadTheRoomPhase;
  settings: ReadTheRoomSettings;
  roundNumber: number;
  nextTeamIndex: number;                   // room.teams index where the search for the next Active Team starts
  activeTeamId: string | null;
  clueOrders: Record<string, string[]>;    // teamId → Clue-giver Order
  clueCursor: Record<string, number>;      // teamId → index of that team's last Clue-giver (-1 before the first)
  clueGiverId: string | null;
  offeredPairIds: number[];
  pair: ReadTheRoomPair | null;
  clue: string | null;
  target: number;
  needle: number;
  holderId: string | null;
  holdStartedAt: number;
  lastMoveAt: Record<string, number>;      // playerId → time of their last accepted move
  calls: Record<string, ReadTheRoomCallState>;
  phaseEndsAt: number | null;              // guess or call deadline; null when untimed or paused
  awayEndsAt: number | null;               // grace deadline; null when nobody is awaited
  revealAt: number | null;
  scores: Record<string, number>;
  lastResult: ReadTheRoomRoundResult | null;
  recap: ReadTheRoomRoundResult[];
  winnerTeamId: string | null;
  tiedAtTop: boolean;
  players: Record<string, ReadTheRoomPlayerRecord>;
  stats: Record<string, ReadTheRoomPlayerStats>;
}

// ---- Constants ----

/** Players online for a Playable Team. */
export const RTR_MIN_TEAM_SIZE = 2;
/** The Target is a whole number from 10 to 90, so the whole Target Zone fits on the Scale. */
export const RTR_TARGET_MIN = 10;
export const RTR_TARGET_MAX = 90;
/** Width of each of the five scoring bands (2-3-4-3-2). */
export const RTR_BAND_WIDTH = 4;
export const RTR_NEEDLE_START = 50;
/** Longest clue, in characters after normalizeClue(). */
export const RTR_CLUE_MAX = 40;
/** Longest Pair label, in characters. */
export const RTR_LABEL_MAX = 20;
/** How long the other teams have to call left or right. */
export const RTR_CALL_MS = 20_000;
/** Grace for an offline Clue-giver, or for an Active Team with no Guesser online. */
export const RTR_AWAY_GRACE_MS = 10_000;
/** The Dial Holder lets go after this long without a move. */
export const RTR_HOLD_IDLE_MS = 3_000;
/** The server drops a player's moves that arrive faster than this. */
export const RTR_MOVE_MIN_GAP_MS = 40;
/** The client sends about 15 moves a second while dragging. */
export const RTR_MOVE_SEND_MS = 66;
/** The host's "Next round" is accepted this long after the reveal starts. */
export const RTR_NEXT_ROUND_LOCK_MS = 3_000;
/** Reveal staging, from the start of the reveal. */
export const RTR_REVEAL_POINTS_MS = 1_000;
export const RTR_REVEAL_CALLS_MS = 1_800;
export const RTR_REVEAL_SCORES_MS = 2_600;

// ---- Rules shared by the server and the client ----

/** Clamp to the Scale and keep one decimal. Callers check Number.isFinite first. */
export function clampPosition(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

/** 4, 3, 2 or 0 points. Distances are compared in tenths, so a Needle on a band edge scores the higher band. */
export function scoreNeedle(needle: number, target: number): 0 | 2 | 3 | 4 {
  const d = Math.abs(Math.round(needle * 10) - Math.round(target * 10));
  const band = RTR_BAND_WIDTH * 10;
  if (d <= band / 2) return 4;      // within 2 units
  if (d <= band * 1.5) return 3;    // within 6
  if (d <= band * 2.5) return 2;    // within 10
  return 0;
}

/** Which side of the Needle the Target is on; null when they coincide. */
export function targetSide(needle: number, target: number): ReadTheRoomSide | null {
  if (target < needle) return 'left';
  if (target > needle) return 'right';
  return null;
}

/** Collapse runs of whitespace and trim, so the client counts what the server checks. */
export function normalizeClue(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

/** Length as people see it: an emoji counts once. Falls back to code points where Intl.Segmenter is missing. */
export function clueLength(clue: string): number {
  return graphemes ? Array.from(graphemes.segment(clue)).length : Array.from(clue).length;
}
