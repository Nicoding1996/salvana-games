import type { Room } from '@/types/hub';
import type {
  ReadTheRoomAward,
  ReadTheRoomAwards,
  ReadTheRoomCallResult,
  ReadTheRoomCallView,
  ReadTheRoomClientState,
  ReadTheRoomDial,
  ReadTheRoomMember,
  ReadTheRoomPlayerRecord,
  ReadTheRoomPlayerStats,
  ReadTheRoomRole,
  ReadTheRoomRoundResult,
  ReadTheRoomServerState,
  ReadTheRoomSettings,
  ReadTheRoomSide,
  ReadTheRoomTimer,
} from '@/types/games/read-the-room';
import {
  DEFAULT_READ_THE_ROOM_SETTINGS,
  RTR_AWAY_GRACE_MS,
  RTR_CALL_MS,
  RTR_CLUE_MAX,
  RTR_GUESS_TIMER_OPTIONS,
  RTR_HOLD_IDLE_MS,
  RTR_MIN_TEAM_SIZE,
  RTR_MOVE_MIN_GAP_MS,
  RTR_NEEDLE_START,
  RTR_NEXT_ROUND_LOCK_MS,
  RTR_TARGET_MAX,
  RTR_TARGET_MIN,
  RTR_TARGET_SCORE_OPTIONS,
  clampPosition,
  clueLength,
  normalizeClue,
  scoreNeedle,
  targetSide,
} from '@/types/games/read-the-room';
import { PAIRS } from './pairs';

// ---- In-memory stores ----
const games = new Map<string, ReadTheRoomServerState>();
const phaseTimers = new Map<string, ReturnType<typeof setTimeout>>();   // the phase's pending step
const tickers = new Map<string, ReturnType<typeof setInterval>>();      // 1 s countdown broadcast
const holdTimers = new Map<string, ReturnType<typeof setTimeout>>();    // lets go of an idle Dial Holder
// Pairs a room has played, kept across rematches and lobby returns until the room is gone
const pairHistory = new Map<string, { createdAt: number; played: Set<number> }>();

/** A timer firing this early still counts as on time. */
const TIMER_SLACK_MS = 50;

/** The phase's pending deadline, for the socket driver. */
export interface ReadTheRoomStep {
  at: number;
  kind: ReadTheRoomTimer['kind'];
  total: number;   // seconds
}

// ---- Helpers ----

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Never trust settings from the client: anything outside the options falls back to the default. */
function sanitizeSettings(input?: Partial<ReadTheRoomSettings>): ReadTheRoomSettings {
  const raw: Partial<ReadTheRoomSettings> = input && typeof input === 'object' ? input : {};
  const targetScore = (RTR_TARGET_SCORE_OPTIONS as readonly unknown[]).includes(raw.targetScore)
    ? raw.targetScore as ReadTheRoomSettings['targetScore']
    : DEFAULT_READ_THE_ROOM_SETTINGS.targetScore;
  const guessTimer = (RTR_GUESS_TIMER_OPTIONS as readonly unknown[]).includes(raw.guessTimer)
    ? raw.guessTimer as ReadTheRoomSettings['guessTimer']
    : DEFAULT_READ_THE_ROOM_SETTINGS.guessTimer;
  return { targetScore, guessTimer };
}

function randomTarget(): number {
  return RTR_TARGET_MIN + Math.floor(Math.random() * (RTR_TARGET_MAX - RTR_TARGET_MIN + 1));
}

function isOnline(room: Room, playerId: string): boolean {
  return room.players[playerId]?.connected === true;
}

function hasLeft(state: ReadTheRoomServerState, room: Room, playerId: string): boolean {
  return state.players[playerId]?.left === true || !room.players[playerId];
}

function onlineIds(room: Room, teamId: string): string[] {
  const team = room.teams.find(t => t.id === teamId);
  return team ? team.playerIds.filter(id => isOnline(room, id)) : [];
}

/** A Playable Team has at least 2 players online. */
function isPlayable(room: Room, teamId: string): boolean {
  return onlineIds(room, teamId).length >= RTR_MIN_TEAM_SIZE;
}

/** The Active Team's players online, apart from the Clue-giver. */
function guesserIds(state: ReadTheRoomServerState, room: Room): string[] {
  if (!state.activeTeamId) return [];
  return onlineIds(room, state.activeTeamId).filter(id => id !== state.clueGiverId);
}

function isGuesser(state: ReadTheRoomServerState, room: Room, playerId: string): boolean {
  return !!state.activeTeamId
    && playerId !== state.clueGiverId
    && room.players[playerId]?.teamId === state.activeTeamId;
}

/** The next player online in a team's Clue-giver Order after `afterIndex`, wrapping around. */
function findClueGiver(
  state: ReadTheRoomServerState,
  room: Room,
  teamId: string,
  afterIndex: number,
  skipId: string | null,
): { id: string; index: number } | null {
  const order = state.clueOrders[teamId] ?? [];
  for (let step = 1; step <= order.length; step++) {
    const index = (afterIndex + step + order.length) % order.length;
    const id = order[index];
    if (id !== skipId && isOnline(room, id)) return { id, index };
  }
  return null;
}

function historyFor(roomCode: string, createdAt: number): Set<number> {
  let entry = pairHistory.get(roomCode);
  if (!entry || entry.createdAt !== createdAt) {
    entry = { createdAt, played: new Set() };
    pairHistory.set(roomCode, entry);
  }
  return entry.played;
}

/** Two different Pairs the room hasn't played, never the ones on offer right now. */
function drawPairs(roomCode: string, room: Room, exclude: readonly number[]): number[] {
  const played = historyFor(roomCode, room.createdAt);
  let pool = PAIRS.filter(p => !played.has(p.id) && !exclude.includes(p.id));
  if (pool.length < 2) {
    played.clear();
    pool = PAIRS.filter(p => !exclude.includes(p.id));
  }
  const first = Math.floor(Math.random() * pool.length);
  let second = Math.floor(Math.random() * (pool.length - 1));
  if (second >= first) second += 1;
  return [pool[first].id, pool[second].id];
}

/** End the current hold and add the time held to the holder's stats. */
function endHold(state: ReadTheRoomServerState, now: number, idle = false): void {
  const holder = state.holderId;
  if (!holder) return;
  const lastMove = state.lastMoveAt[holder] ?? now;
  // An idle hold ended at the last move; otherwise count up to now, never more than the idle limit
  const end = idle ? lastMove : Math.min(now, lastMove + RTR_HOLD_IDLE_MS);
  const stats = state.stats[holder];
  if (stats) stats.holdMs += Math.max(0, end - state.holdStartedAt);
  state.holderId = null;
}

function resetRound(state: ReadTheRoomServerState): void {
  state.clueGiverId = null;
  state.offeredPairIds = [];
  state.pair = null;
  state.clue = null;
  state.needle = RTR_NEEDLE_START;
  state.holderId = null;
  state.lastMoveAt = {};
  state.calls = {};
  state.phaseEndsAt = null;
  state.awayEndsAt = null;
  state.revealAt = null;
  state.lastResult = null;
  state.tiedAtTop = false;
}

function finish(state: ReadTheRoomServerState, now: number): void {
  endHold(state, now);
  state.phase = 'finished';
  state.phaseEndsAt = null;
  state.awayEndsAt = null;
}

// ---- Lifecycle ----

/** Names of teams with fewer than 2 players online (start and rematch checks). */
export function unplayableTeams(room: Room): string[] {
  return room.teams.filter(t => !isPlayable(room, t.id)).map(t => t.name);
}

export function createGame(room: Room, settings?: Partial<ReadTheRoomSettings>): ReadTheRoomServerState {
  clearTimers(room.code);

  const players: Record<string, ReadTheRoomPlayerRecord> = {};
  const stats: Record<string, ReadTheRoomPlayerStats> = {};
  const clueOrders: Record<string, string[]> = {};
  const clueCursor: Record<string, number> = {};
  const scores: Record<string, number> = {};
  for (const team of room.teams) {
    const ids = team.playerIds.filter(id => room.players[id]);
    clueOrders[team.id] = shuffle([...ids]);
    clueCursor[team.id] = -1;
    scores[team.id] = 0;
    for (const id of ids) {
      const p = room.players[id];
      players[id] = { name: p.name, avatar: p.avatar, teamId: team.id, left: false };
      stats[id] = { cluePoints: 0, holdMs: 0 };
    }
  }

  const state: ReadTheRoomServerState = {
    phase: 'clue',
    settings: sanitizeSettings(settings),
    roundNumber: 0,
    nextTeamIndex: room.teams.length > 0 ? Math.floor(Math.random() * room.teams.length) : 0,
    activeTeamId: null,
    clueOrders,
    clueCursor,
    clueGiverId: null,
    offeredPairIds: [],
    pair: null,
    clue: null,
    target: RTR_NEEDLE_START,
    needle: RTR_NEEDLE_START,
    holderId: null,
    holdStartedAt: 0,
    lastMoveAt: {},
    calls: {},
    phaseEndsAt: null,
    awayEndsAt: null,
    revealAt: null,
    scores,
    lastResult: null,
    recap: [],
    winnerTeamId: null,
    tiedAtTop: false,
    players,
    stats,
  };

  games.set(room.code, state);
  startRound(room.code, room);
  console.log(`[ReadTheRoom] Game created in ${room.code} with ${Object.keys(players).length} players`);
  return state;
}

export function getGameState(roomCode: string): ReadTheRoomServerState | undefined {
  return games.get(roomCode);
}

/**
 * Start the next Round: the next Playable Team (from `nextTeamIndex`, wrapping) and its next
 * Clue-giver online, two Pairs and a new Target. With no Playable Team the game waits.
 */
export function startRound(roomCode: string, room: Room): 'started' | 'waiting' | 'unavailable' {
  const state = games.get(roomCode);
  if (!state || state.phase === 'finished') return 'unavailable';
  endHold(state, Date.now());
  resetRound(state);

  const count = room.teams.length;
  for (let step = 0; step < count; step++) {
    const index = (state.nextTeamIndex + step) % count;
    const team = room.teams[index];
    if (!isPlayable(room, team.id)) continue;
    const giver = findClueGiver(state, room, team.id, state.clueCursor[team.id] ?? -1, null);
    if (!giver) continue;

    state.nextTeamIndex = (index + 1) % count;
    state.activeTeamId = team.id;
    state.clueCursor[team.id] = giver.index;
    state.clueGiverId = giver.id;
    state.roundNumber += 1;
    state.offeredPairIds = drawPairs(roomCode, room, []);
    state.target = randomTarget();
    state.phase = 'clue';
    return 'started';
  }

  state.activeTeamId = null;
  state.phase = 'waiting';
  return 'waiting';
}

/**
 * The clue moves to the next teammate online, with two new Pairs and a new Target.
 * If the team can't play any more, the next team's Round starts instead.
 */
function passClue(roomCode: string, state: ReadTheRoomServerState, room: Room): void {
  const teamId = state.activeTeamId;
  const next = teamId
    ? findClueGiver(state, room, teamId, state.clueCursor[teamId] ?? -1, state.clueGiverId)
    : null;
  if (!teamId || !next || !isPlayable(room, teamId)) {
    startRound(roomCode, room);
    return;
  }
  state.clueCursor[teamId] = next.index;
  state.clueGiverId = next.id;
  state.offeredPairIds = drawPairs(roomCode, room, state.offeredPairIds);
  state.target = randomTarget();
  state.awayEndsAt = null;
}

/** Host: someone else on the team gives the clue. */
export function skipClueGiver(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'clue') return false;
  passClue(roomCode, state, room);
  return true;
}

export function giveClue(
  roomCode: string,
  room: Room,
  playerId: string,
  pairId: number,
  raw: string,
): { ok: true } | { error: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'clue') return { error: 'The clue has already been given' };
  if (playerId !== state.clueGiverId) return { error: 'Only the clue-giver can give the clue' };
  if (!Number.isInteger(pairId) || !state.offeredPairIds.includes(pairId) || !PAIRS[pairId]) {
    return { error: 'Pick one of the two scales' };
  }
  const clue = normalizeClue(raw);
  const length = clueLength(clue);
  if (length === 0) return { error: 'Type a clue first' };
  if (length > RTR_CLUE_MAX) return { error: `Keep the clue to ${RTR_CLUE_MAX} characters` };

  historyFor(roomCode, room.createdAt).add(pairId);
  state.pair = { ...PAIRS[pairId] };
  state.clue = clue;
  state.offeredPairIds = [];
  state.needle = RTR_NEEDLE_START;
  state.phase = 'guess';
  state.phaseEndsAt = null;   // nextStep() starts the guess clock
  state.awayEndsAt = null;
  return { ok: true };
}

// ---- The shared dial ----

/** A Guesser moves the dial. Returns the position to relay, or null if the move doesn't count. */
export function moveDial(
  roomCode: string,
  room: Room,
  playerId: string,
  position: number,
  now: number,
): ReadTheRoomDial | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'guess' || !Number.isFinite(position)) return null;
  if (!isGuesser(state, room, playerId)) return null;

  if (state.holderId && state.holderId !== playerId) {
    // Someone else has it, unless they stopped moving a while ago
    const idleFor = now - (state.lastMoveAt[state.holderId] ?? 0);
    if (idleFor < RTR_HOLD_IDLE_MS) return null;
    endHold(state, now, true);
  }

  const last = state.lastMoveAt[playerId];
  if (last !== undefined && now - last < RTR_MOVE_MIN_GAP_MS) return null;

  if (!state.holderId) {
    state.holderId = playerId;
    state.holdStartedAt = now;
  }
  state.lastMoveAt[playerId] = now;
  state.needle = clampPosition(position);
  return { position: state.needle, holderId: state.holderId };
}

/** The Dial Holder lets go: their final position always applies. */
export function releaseDial(
  roomCode: string,
  room: Room,
  playerId: string,
  position: number,
  now: number,
): ReadTheRoomDial | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'guess' || state.holderId !== playerId) return null;
  if (Number.isFinite(position)) state.needle = clampPosition(position);
  state.lastMoveAt[playerId] = now;
  endHold(state, now);
  return { position: state.needle, holderId: null };
}

/** Let go of a holder who hasn't moved the dial for a while. */
export function expireHold(roomCode: string, holderId: string, now: number): ReadTheRoomDial | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'guess' || state.holderId !== holderId) return null;
  const idleFor = now - (state.lastMoveAt[holderId] ?? 0);
  if (idleFor < RTR_HOLD_IDLE_MS - TIMER_SLACK_MS) return null;
  endHold(state, now, true);
  return { position: state.needle, holderId: null };
}

// ---- Locking in, calls, reveal ----

export function lockIn(roomCode: string, room: Room, playerId: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'guess' || !isGuesser(state, room, playerId)) return false;
  lockNeedle(state, room, Date.now());
  return true;
}

/** Fix the Needle. Every other team with someone online calls left or right; with none, reveal now. */
function lockNeedle(state: ReadTheRoomServerState, room: Room, now: number): void {
  endHold(state, now);
  state.phase = 'call';
  state.phaseEndsAt = null;   // nextStep() starts the call clock
  state.awayEndsAt = null;
  state.calls = {};
  for (const team of room.teams) {
    if (team.id === state.activeTeamId || onlineIds(room, team.id).length === 0) continue;
    state.calls[team.id] = { pick: null, pickedById: null, locked: false };
  }
  if (Object.keys(state.calls).length === 0) reveal(state, room, now);
}

/** Every calling team has locked its Call, or has nobody online. */
function callsComplete(state: ReadTheRoomServerState, room: Room): boolean {
  return Object.entries(state.calls).every(([teamId, call]) => call.locked || onlineIds(room, teamId).length === 0);
}

export function pickCall(roomCode: string, room: Room, playerId: string, side: ReadTheRoomSide): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'call' || (side !== 'left' && side !== 'right')) return false;
  const teamId = room.players[playerId]?.teamId;
  const call = teamId ? state.calls[teamId] : undefined;
  if (!call || call.locked) return false;
  call.pick = side;
  call.pickedById = playerId;
  return true;
}

export function lockCall(roomCode: string, room: Room, playerId: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'call') return false;
  const teamId = room.players[playerId]?.teamId;
  const call = teamId ? state.calls[teamId] : undefined;
  if (!call || call.locked || !call.pick) return false;
  call.locked = true;
  if (callsComplete(state, room)) reveal(state, room, Date.now());
  return true;
}

/** Score the Round: 4/3/2 for the Active Team, +1 per correct Call (none after a 4). */
function reveal(state: ReadTheRoomServerState, room: Room, now: number): void {
  const teamId = state.activeTeamId;
  const pair = state.pair;
  if (!teamId || !pair) return;
  endHold(state, now);

  const points = scoreNeedle(state.needle, state.target);
  const side = targetSide(state.needle, state.target);
  const gains: Record<string, number> = {};
  for (const team of room.teams) gains[team.id] = 0;
  gains[teamId] = points;

  const calls: ReadTheRoomCallResult[] = Object.entries(state.calls).map(([callTeamId, call]) => {
    const correct = points !== 4 && call.pick !== null && call.pick === side;
    if (correct) gains[callTeamId] = (gains[callTeamId] ?? 0) + 1;
    return { teamId: callTeamId, pick: call.pick, correct };
  });
  for (const [id, gain] of Object.entries(gains)) state.scores[id] = (state.scores[id] ?? 0) + gain;

  const giverId = state.clueGiverId ?? '';
  if (state.stats[giverId]) state.stats[giverId].cluePoints += points;

  const result: ReadTheRoomRoundResult = {
    roundNumber: state.roundNumber,
    teamId,
    clueGiverId: giverId,
    clueGiverName: state.players[giverId]?.name ?? room.players[giverId]?.name ?? 'Someone',
    pair,
    clue: state.clue ?? '',
    target: state.target,
    needle: state.needle,
    points,
    side,
    calls,
    gains,
  };
  state.lastResult = result;
  state.recap.push(result);
  state.phase = 'reveal';
  state.revealAt = now;
  state.phaseEndsAt = null;
  state.awayEndsAt = null;

  // One team alone at the top with enough points wins; a shared top keeps the game going
  const top = Math.max(0, ...room.teams.map(t => state.scores[t.id] ?? 0));
  const leaders = room.teams.filter(t => (state.scores[t.id] ?? 0) === top);
  if (top >= state.settings.targetScore) {
    if (leaders.length === 1) state.winnerTeamId = leaders[0].id;
    else state.tiedAtTop = true;
  }
}

/** Host: the next Round, or the final results once there's a winner. */
export function nextRound(roomCode: string, room: Room, now: number): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'reveal' || state.revealAt === null) return false;
  if (now - state.revealAt < RTR_NEXT_ROUND_LOCK_MS) return false;
  if (state.winnerTeamId) finish(state, now);
  else startRound(roomCode, room);
  return true;
}

/** Host ends the game early: the summary shows the current scores. */
export function endGame(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase === 'finished') return false;
  finish(state, Date.now());
  return true;
}

/** Same teams and settings, fresh scores. The room's pair history carries over. */
export function rematch(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'finished') return false;
  createGame(room, state.settings);
  return true;
}

// ---- Timing ----

/**
 * The phase's pending deadline: the guess clock, the call clock, or the away grace.
 * A deadline that's already running is kept, so reconnects and broadcasts never reset it.
 */
export function nextStep(roomCode: string, room: Room, now: number): ReadTheRoomStep | null {
  const state = games.get(roomCode);
  if (!state) return null;

  if (state.phase === 'clue') {
    if (state.clueGiverId && !isOnline(room, state.clueGiverId)) {
      state.awayEndsAt ??= now + RTR_AWAY_GRACE_MS;
      return { at: state.awayEndsAt, kind: 'away', total: RTR_AWAY_GRACE_MS / 1000 };
    }
    state.awayEndsAt = null;
    return null;
  }

  if (state.phase === 'guess') {
    const timed = state.settings.guessTimer > 0;
    if (timed) state.phaseEndsAt ??= now + state.settings.guessTimer * 1000;
    if (guesserIds(state, room).length === 0) state.awayEndsAt ??= now + RTR_AWAY_GRACE_MS;
    else state.awayEndsAt = null;

    const guess: ReadTheRoomStep | null = timed && state.phaseEndsAt !== null
      ? { at: state.phaseEndsAt, kind: 'guess', total: state.settings.guessTimer }
      : null;
    const away: ReadTheRoomStep | null = state.awayEndsAt !== null
      ? { at: state.awayEndsAt, kind: 'away', total: RTR_AWAY_GRACE_MS / 1000 }
      : null;
    if (guess && away) return away.at < guess.at ? away : guess;
    return away ?? guess;
  }

  if (state.phase === 'call') {
    state.phaseEndsAt ??= now + RTR_CALL_MS;
    return { at: state.phaseEndsAt, kind: 'call', total: RTR_CALL_MS / 1000 };
  }

  return null;
}

/** A deadline passed. Re-checks the condition, because things may have changed since it was set. */
export function runStep(roomCode: string, room: Room, kind: ReadTheRoomStep['kind'], now: number): boolean {
  const state = games.get(roomCode);
  if (!state) return false;
  const due = (deadline: number | null) => deadline !== null && now >= deadline - TIMER_SLACK_MS;

  if (state.phase === 'clue' && kind === 'away') {
    if (!state.clueGiverId || isOnline(room, state.clueGiverId) || !due(state.awayEndsAt)) return false;
    passClue(roomCode, state, room);
    return true;
  }
  if (state.phase === 'guess' && kind === 'guess') {
    if (!due(state.phaseEndsAt)) return false;
    lockNeedle(state, room, now);
    return true;
  }
  if (state.phase === 'guess' && kind === 'away') {
    if (!due(state.awayEndsAt) || guesserIds(state, room).length > 0) return false;
    lockNeedle(state, room, now);
    return true;
  }
  if (state.phase === 'call' && kind === 'call') {
    if (!due(state.phaseEndsAt)) return false;
    reveal(state, room, now);
    return true;
  }
  return false;
}

/** Nobody is online: drop the deadlines so the clocks start fresh when someone is back. */
export function pauseClocks(roomCode: string): void {
  const state = games.get(roomCode);
  if (!state) return;
  state.phaseEndsAt = null;
  state.awayEndsAt = null;
}

/**
 * Re-check what the phase waits on after a disconnect, reconnect or departure: an offline holder
 * lets go, a Clue-giver who left hands the clue on, finished calls reveal, a waiting game resumes.
 */
export function settle(roomCode: string, room: Room, now: number): void {
  const state = games.get(roomCode);
  if (!state) return;

  if (state.holderId && !isOnline(room, state.holderId)) endHold(state, now);

  if (state.phase === 'clue' && state.clueGiverId && hasLeft(state, room, state.clueGiverId)) {
    passClue(roomCode, state, room);
  } else if (state.phase === 'call' && callsComplete(state, room)) {
    reveal(state, room, now);
  } else if (state.phase === 'waiting') {
    startRound(roomCode, room);
  }
}

// ---- Departures and reconnection ----

/** A player left for good: they're skipped from now on, but stay in the recap and awards. */
export function removePlayer(roomCode: string, playerId: string): boolean {
  const state = games.get(roomCode);
  const record = state?.players[playerId];
  if (!state || !record) return false;
  record.left = true;
  if (state.holderId === playerId) endHold(state, Date.now());
  return true;
}

function moveKey<T>(record: Record<string, T>, oldId: string, newId: string): void {
  if (oldId in record) {
    record[newId] = record[oldId];
    delete record[oldId];
  }
}

export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = games.get(roomCode);
  if (!state || oldId === newId) return;
  const swap = (id: string | null) => (id === oldId ? newId : id);

  moveKey(state.players, oldId, newId);
  moveKey(state.stats, oldId, newId);
  moveKey(state.lastMoveAt, oldId, newId);
  for (const order of Object.values(state.clueOrders)) {
    const index = order.indexOf(oldId);
    if (index !== -1) order[index] = newId;
  }
  state.clueGiverId = swap(state.clueGiverId);
  state.holderId = swap(state.holderId);
  for (const call of Object.values(state.calls)) call.pickedById = swap(call.pickedById);
  for (const result of state.recap) {
    if (result.clueGiverId === oldId) result.clueGiverId = newId;
  }
  if (state.lastResult?.clueGiverId === oldId) state.lastResult.clueGiverId = newId;

  console.log(`[ReadTheRoom] Swapped player ID ${oldId} → ${newId}`);
}

// ---- Client view ----

function members(state: ReadTheRoomServerState, room: Room, teamId: string): ReadTheRoomMember[] {
  return (state.clueOrders[teamId] ?? []).map(id => {
    const live = room.players[id];
    const record = state.players[id];
    return {
      id,
      name: live?.name ?? record?.name ?? 'Someone',
      avatar: live?.avatar ?? record?.avatar ?? '🙂',
      connected: live?.connected ?? false,
      left: hasLeft(state, room, id),
    };
  });
}

/** Who would give the next clue if the host starts the next Round now. */
function previewNext(state: ReadTheRoomServerState, room: Room): { teamId: string; clueGiverId: string } | null {
  const count = room.teams.length;
  for (let step = 0; step < count; step++) {
    const team = room.teams[(state.nextTeamIndex + step) % count];
    if (!isPlayable(room, team.id)) continue;
    const giver = findClueGiver(state, room, team.id, state.clueCursor[team.id] ?? -1, null);
    if (giver) return { teamId: team.id, clueGiverId: giver.id };
  }
  return null;
}

function timerSnapshot(state: ReadTheRoomServerState, now: number): ReadTheRoomTimer | null {
  let step: ReadTheRoomStep | null = null;
  if (state.phase === 'clue' && state.awayEndsAt !== null) {
    step = { at: state.awayEndsAt, kind: 'away', total: RTR_AWAY_GRACE_MS / 1000 };
  } else if (state.phase === 'guess') {
    const guess = state.phaseEndsAt !== null
      ? { at: state.phaseEndsAt, kind: 'guess' as const, total: state.settings.guessTimer }
      : null;
    const away = state.awayEndsAt !== null
      ? { at: state.awayEndsAt, kind: 'away' as const, total: RTR_AWAY_GRACE_MS / 1000 }
      : null;
    step = guess && away ? (away.at < guess.at ? away : guess) : away ?? guess;
  } else if (state.phase === 'call' && state.phaseEndsAt !== null) {
    step = { at: state.phaseEndsAt, kind: 'call', total: RTR_CALL_MS / 1000 };
  }
  if (!step) return null;
  return { kind: step.kind, secondsLeft: Math.max(0, Math.ceil((step.at - now) / 1000)), total: step.total };
}

/** Everyone tied for the highest value, if it reaches the minimum. */
function topPlayers(
  state: ReadTheRoomServerState,
  value: (stats: ReadTheRoomPlayerStats) => number,
  minimum: number,
): ReadTheRoomAward | null {
  let best = 0;
  let playerIds: string[] = [];
  for (const [id, stats] of Object.entries(state.stats)) {
    const v = value(stats);
    if (v > best) {
      best = v;
      playerIds = [id];
    } else if (v === best && v > 0) {
      playerIds.push(id);
    }
  }
  return best >= minimum ? { playerIds, value: best } : null;
}

function awards(state: ReadTheRoomServerState): ReadTheRoomAwards {
  return {
    mindReader: topPlayers(state, s => s.cluePoints, 1),
    dialHog: topPlayers(state, s => Math.floor(s.holdMs / 1000), 1),
  };
}

/** Personalized state. The Target, the offered Pairs and other teams' picks stay hidden until the reveal. */
export function getClientState(roomCode: string, playerId: string, room: Room): ReadTheRoomClientState | null {
  const state = games.get(roomCode);
  if (!state) return null;
  const now = Date.now();

  const myTeamId = state.players[playerId]?.teamId ?? null;
  const isClueGiver = playerId === state.clueGiverId;
  const role: ReadTheRoomRole = !myTeamId
    ? 'watcher'
    : myTeamId === state.activeTeamId ? (isClueGiver ? 'clueGiver' : 'guesser') : 'opponent';
  const revealed = state.phase === 'reveal';
  const inRound = state.phase === 'clue' || state.phase === 'guess' || state.phase === 'call';

  const calls: ReadTheRoomCallView[] = Object.entries(state.calls).map(([teamId, call]) => {
    const visible = revealed || teamId === myTeamId;
    return {
      teamId,
      locked: call.locked,
      pick: visible ? call.pick : null,
      pickedById: visible ? call.pickedById : null,
    };
  });

  return {
    phase: state.phase,
    settings: state.settings,
    roundNumber: state.roundNumber,
    teams: room.teams.map(team => ({
      id: team.id,
      name: team.name,
      color: team.color,
      score: state.scores[team.id] ?? 0,
      members: members(state, room, team.id),
    })),
    myTeamId,
    myRole: role,
    activeTeamId: state.activeTeamId,
    clueGiverId: state.clueGiverId,
    offeredPairs: state.phase === 'clue' && isClueGiver
      ? state.offeredPairIds.map(id => ({ ...PAIRS[id] }))
      : null,
    target: revealed || (inRound && isClueGiver) ? state.target : null,
    pair: state.pair,
    clue: state.clue,
    dial: { position: state.needle, holderId: state.holderId },
    calls,
    timer: timerSnapshot(state, now),
    lastResult: revealed || state.phase === 'finished' ? state.lastResult : null,
    revealElapsedMs: revealed && state.revealAt !== null ? now - state.revealAt : 0,
    nextUp: revealed && !state.winnerTeamId ? previewNext(state, room) : null,
    winnerTeamId: state.winnerTeamId,
    tiedAtTop: state.tiedAtTop,
    waitingTeamIds: state.phase === 'waiting' ? room.teams.filter(t => !isPlayable(room, t.id)).map(t => t.id) : [],
    recap: state.phase === 'finished' ? state.recap : [],
    awards: state.phase === 'finished' ? awards(state) : null,
  };
}

// ---- Timers (one pending step, one ticker and one hold timer per room) ----

export function setPhaseTimer(roomCode: string, timeout: ReturnType<typeof setTimeout>): void {
  const existing = phaseTimers.get(roomCode);
  if (existing) clearTimeout(existing);
  phaseTimers.set(roomCode, timeout);
}

export function setTicker(roomCode: string, interval: ReturnType<typeof setInterval>): void {
  const existing = tickers.get(roomCode);
  if (existing) clearInterval(existing);
  tickers.set(roomCode, interval);
}

/** Drop the pending step and the countdown ticker. */
export function clearPhaseTimers(roomCode: string): void {
  const timeout = phaseTimers.get(roomCode);
  if (timeout) {
    clearTimeout(timeout);
    phaseTimers.delete(roomCode);
  }
  const interval = tickers.get(roomCode);
  if (interval) {
    clearInterval(interval);
    tickers.delete(roomCode);
  }
}

export function setHoldTimer(roomCode: string, timeout: ReturnType<typeof setTimeout>): void {
  clearHoldTimer(roomCode);
  holdTimers.set(roomCode, timeout);
}

export function clearHoldTimer(roomCode: string): void {
  const timeout = holdTimers.get(roomCode);
  if (timeout) {
    clearTimeout(timeout);
    holdTimers.delete(roomCode);
  }
}

function clearTimers(roomCode: string): void {
  clearPhaseTimers(roomCode);
  clearHoldTimer(roomCode);
}

/** Back to the lobby: the state goes, the room's pair history stays. */
export function cleanupGame(roomCode: string): void {
  clearTimers(roomCode);
  games.delete(roomCode);
}

/**
 * Called by the 60 s sweep. Drops pair history for rooms that are gone (or whose code now belongs
 * to a new room), and game state for rooms that are gone or no longer playing this game.
 */
export function pruneRooms(getRoom: (roomCode: string) => Room | undefined): void {
  for (const [code, entry] of pairHistory) {
    if (getRoom(code)?.createdAt !== entry.createdAt) pairHistory.delete(code);
  }
  for (const code of [...games.keys()]) {
    if (getRoom(code)?.currentGameId !== 'read-the-room') cleanupGame(code);
  }
}
