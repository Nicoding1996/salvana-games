import type { Room } from '@/types/hub';
import type {
  ChallengeResult,
  LiarsDiceClientState,
  LiarsDicePlayerInfo,
  LiarsDiceServerState,
  LiarsDiceSettings,
  LiarsDiceStats,
  LiarsDiceTurnTimer,
} from '@/types/games/liars-dice';
import {
  DEFAULT_LIARS_DICE_SETTINGS,
  DICE_PER_PLAYER,
  LIARS_DICE_MAX_PLAYERS,
  countMatches,
  isValidRaise,
} from '@/types/games/liars-dice';

// ---- In-memory game store ----
const games = new Map<string, LiarsDiceServerState>();
const turnTimers = new Map<string, ReturnType<typeof setInterval>>();
const phaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

const TURN_TIMER_OPTIONS = [15, 30, 45, 0] as const;

/** Never trust settings from the client: clamp everything to the allowed options. */
function sanitizeSettings(input?: Partial<LiarsDiceSettings>): LiarsDiceSettings {
  const s = { ...DEFAULT_LIARS_DICE_SETTINGS, ...input };
  return {
    maxPlayers: Math.min(LIARS_DICE_MAX_PLAYERS, Math.max(2, Math.floor(Number(s.maxPlayers)) || LIARS_DICE_MAX_PLAYERS)),
    lives: s.lives === 3 ? 3 : 2,
    wildOnes: s.wildOnes === true,
    spotOn: s.spotOn === true,
    turnTimer: (TURN_TIMER_OPTIONS as readonly number[]).includes(s.turnTimer)
      ? s.turnTimer
      : DEFAULT_LIARS_DICE_SETTINGS.turnTimer,
  };
}

function emptyStats(): LiarsDiceStats {
  return { calls: 0, correctCalls: 0, caught: 0, spotOnHits: 0 };
}

function statsFor(state: LiarsDiceServerState, id: string): LiarsDiceStats {
  if (!state.stats[id]) state.stats[id] = emptyStats();
  return state.stats[id];
}

function rollDice(): number[] {
  return Array.from({ length: DICE_PER_PLAYER }, () => Math.floor(Math.random() * 6) + 1);
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function aliveIds(state: LiarsDiceServerState): string[] {
  return state.seatingOrder.filter(id => state.playerData[id]?.alive);
}

/** Next alive player clockwise from a seat (the seat's owner may be out already). */
function nextAliveAfter(state: LiarsDiceServerState, id: string): string | null {
  const n = state.seatingOrder.length;
  const start = state.seatingOrder.indexOf(id);
  for (let step = 1; step <= n; step++) {
    const candidate = state.seatingOrder[(Math.max(start, 0) + step) % n];
    if (state.playerData[candidate]?.alive) return candidate;
  }
  return null;
}

/** The player on a seat if they're alive, otherwise the next alive player clockwise. */
function aliveFrom(state: LiarsDiceServerState, id: string): string | null {
  return state.playerData[id]?.alive ? id : nextAliveAfter(state, id);
}

function totalDice(state: LiarsDiceServerState): number {
  return state.roundPlayers.reduce((sum, id) => sum + (state.playerData[id]?.dice.length ?? 0), 0);
}

function playerName(state: LiarsDiceServerState, room: Room, id: string): string {
  return room.players[id]?.name || state.playerData[id]?.name || 'Unknown';
}

function playerAvatar(state: LiarsDiceServerState, room: Room, id: string): string {
  return room.players[id]?.avatar || state.playerData[id]?.avatar || '🎲';
}

// ---- Lifecycle ----

export function createGame(room: Room, settings?: Partial<LiarsDiceSettings>): LiarsDiceServerState {
  clearTimers(room.code);
  const merged = sanitizeSettings(settings);

  const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);
  shuffleArray(playerIds);

  const playerData: LiarsDiceServerState['playerData'] = {};
  const stats: Record<string, LiarsDiceStats> = {};
  for (const id of playerIds) {
    const rp = room.players[id];
    playerData[id] = { name: rp.name, avatar: rp.avatar, dice: rollDice(), lives: merged.lives, alive: true, left: false };
    stats[id] = emptyStats();
  }

  const state: LiarsDiceServerState = {
    phase: 'rolling',
    playerData,
    seatingOrder: [...playerIds],
    roundPlayers: [...playerIds],
    activePlayerId: playerIds[0] ?? null,
    currentBid: null,
    bidHistory: [],
    roundNumber: 1,
    settings: merged,
    eliminationOrder: [],
    challengeResult: null,
    rollsReceived: new Set(),
    stats,
    winnerId: null,
    turnTimerEnd: null,
    turnTimerTotal: 0,
    turnTimerPlayerId: null,
  };

  games.set(room.code, state);
  console.log(`[LiarsDice] Game created in ${room.code} with ${playerIds.length} players`);
  return state;
}

export function getGameState(roomCode: string): LiarsDiceServerState | undefined {
  return games.get(roomCode);
}

export function endGame(roomCode: string): void {
  clearTimers(roomCode);
  games.delete(roomCode);
  console.log(`[LiarsDice] Game ended in ${roomCode}`);
}

// ---- Rolling ----

export function markRollComplete(roomCode: string, playerId: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'rolling' || !state.playerData[playerId]?.alive) return false;
  if (state.rollsReceived.has(playerId)) return false;
  state.rollsReceived.add(playerId);
  return true;
}

/** Every connected player still in has rolled (offline players don't hold the table up). */
export function allRollsComplete(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'rolling') return false;
  const connected = aliveIds(state).filter(id => room.players[id]?.connected);
  return connected.length > 0 && connected.every(id => state.rollsReceived.has(id));
}

export function startBidding(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'rolling') return false;

  state.phase = 'bidding';
  state.currentBid = null;
  state.bidHistory = [];
  state.challengeResult = null;
  // The starter may have left while everyone was rolling
  state.activePlayerId = state.activePlayerId ? aliveFrom(state, state.activePlayerId) : aliveIds(state)[0] ?? null;
  return true;
}

// ---- Bidding ----

export function placeBid(
  roomCode: string,
  playerId: string,
  quantity: number,
  faceValue: number,
  room: Room,
  auto = false,
): { success: boolean; error?: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'bidding') return { success: false, error: 'Not in bidding phase' };
  if (state.activePlayerId !== playerId) return { success: false, error: 'Not your turn' };
  if (!state.playerData[playerId]?.alive) return { success: false, error: 'You are out of this game' };

  if (!Number.isInteger(faceValue) || faceValue < 1 || faceValue > 6) {
    return { success: false, error: 'Invalid face value' };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > totalDice(state)) {
    return { success: false, error: 'Invalid quantity' };
  }
  if (!isValidRaise(state.currentBid, { quantity, faceValue })) {
    return { success: false, error: 'Bid must be higher than the current bid' };
  }

  state.bidHistory.push({
    playerId,
    playerName: playerName(state, room, playerId),
    playerAvatar: playerAvatar(state, room, playerId),
    quantity,
    faceValue,
    type: 'bid',
    ...(auto ? { auto: true } : {}),
  });
  state.currentBid = { quantity, faceValue, playerId };
  state.activePlayerId = nextAliveAfter(state, playerId);
  return { success: true };
}

/**
 * LIAR: the bid is wrong → the bidder loses a life, otherwise the caller does.
 * SPOT ON: exactly right → everyone else loses a life, otherwise the caller does.
 */
export function challenge(
  roomCode: string,
  playerId: string,
  type: 'liar' | 'spotOn',
  room: Room,
  auto = false,
): ChallengeResult | { error: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'bidding') return { error: 'Not in bidding phase' };
  if (type === 'spotOn' && !state.settings.spotOn) return { error: 'Spot On is not enabled' };
  if (state.activePlayerId !== playerId) return { error: 'Not your turn' };
  const bid = state.currentBid;
  if (!bid) return { error: 'There is no bid to challenge yet' };

  state.bidHistory.push({
    playerId,
    playerName: playerName(state, room, playerId),
    playerAvatar: playerAvatar(state, room, playerId),
    quantity: bid.quantity,
    faceValue: bid.faceValue,
    type,
    ...(auto ? { auto: true } : {}),
  });

  const allDice: Record<string, number[]> = {};
  for (const id of state.roundPlayers) allDice[id] = [...(state.playerData[id]?.dice ?? [])];
  const actualCount = Object.values(allDice).reduce((sum, dice) => sum + countMatches(dice, bid.faceValue, state.settings.wildOnes), 0);

  let wasCorrect: boolean;
  let loserIds: string[];
  if (type === 'liar') {
    const bidTrue = actualCount >= bid.quantity;
    wasCorrect = !bidTrue;
    loserIds = [bidTrue ? playerId : bid.playerId];
    if (!bidTrue) statsFor(state, bid.playerId).caught++;
  } else {
    wasCorrect = actualCount === bid.quantity;
    loserIds = wasCorrect ? aliveIds(state).filter(id => id !== playerId) : [playerId];
    if (wasCorrect) statsFor(state, playerId).spotOnHits++;
  }
  const s = statsFor(state, playerId);
  s.calls++;
  if (wasCorrect) s.correctCalls++;

  const result: ChallengeResult = {
    type,
    callerId: playerId,
    callerName: playerName(state, room, playerId),
    bidderId: bid.playerId,
    bidderName: playerName(state, room, bid.playerId),
    bid: { quantity: bid.quantity, faceValue: bid.faceValue },
    actualCount,
    allDice,
    loserIds,
    wasCorrect,
    auto,
  };

  state.challengeResult = result;
  state.phase = 'challenge';
  state.activePlayerId = null;
  return result;
}

/**
 * The turn timer ran out, or the player is away: play the turn for them.
 * Opening bid → one of the face they hold most (always true). Otherwise → LIAR.
 */
export function autoPlay(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'bidding' || !state.activePlayerId) return false;
  const activeId = state.activePlayerId;

  if (!state.currentBid) {
    const dice = state.playerData[activeId]?.dice ?? [];
    let face = 6;
    let best = -1;
    for (let f = 6; f >= 1; f--) {
      const n = countMatches(dice, f, state.settings.wildOnes);
      if (n > best) {
        best = n;
        face = f;
      }
    }
    return placeBid(roomCode, activeId, 1, face, room, true).success;
  }

  return !('error' in challenge(roomCode, activeId, 'liar', room, true));
}

/** Take lives after the reveal. Returns true if anything changed. */
export function applyChallenge(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'challenge' || !state.challengeResult) return false;

  for (const id of state.challengeResult.loserIds) {
    const pd = state.playerData[id];
    if (!pd || !pd.alive) continue;
    pd.lives = Math.max(0, pd.lives - 1);
    if (pd.lives === 0) {
      pd.alive = false;
      if (!state.eliminationOrder.includes(id)) state.eliminationOrder.push(id);
    }
  }

  finishIfOver(state);
  if (state.phase === 'challenge') state.phase = 'roundEnd';
  return true;
}

/** Re-roll for everyone still in. The round's loser opens (or whoever sits next, if they're out). */
export function startNewRound(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'roundEnd') return false;

  const last = state.challengeResult;
  let starter: string | null = null;
  if (last) {
    // A correct SPOT ON hurts everyone else: the caller opens the next round
    const seat = last.type === 'spotOn' && last.wasCorrect ? last.callerId : last.loserIds[0];
    starter = seat ? aliveFrom(state, seat) : null;
  }

  state.roundNumber++;
  state.roundPlayers = aliveIds(state);
  for (const id of state.roundPlayers) state.playerData[id].dice = rollDice();
  state.activePlayerId = starter ?? state.roundPlayers[0] ?? null;
  state.currentBid = null;
  state.bidHistory = [];
  state.challengeResult = null;
  state.rollsReceived = new Set();
  state.phase = 'rolling';
  return true;
}

function finishIfOver(state: LiarsDiceServerState): void {
  const alive = aliveIds(state);
  if (alive.length <= 1) {
    state.phase = 'finished';
    state.winnerId = alive[0] ?? null;
    state.activePlayerId = null;
  }
}

/**
 * A player left the room for good. They're out of the game. Their dice stay on the
 * table until the round ends (bids were made against them). Returns true if the game changed.
 */
export function removePlayer(roomCode: string, playerId: string): boolean {
  const state = games.get(roomCode);
  const pd = state?.playerData[playerId];
  if (!state || !pd || pd.left || state.phase === 'finished') return false;

  pd.left = true;
  if (pd.alive) {
    pd.alive = false;
    pd.lives = 0;
    if (!state.eliminationOrder.includes(playerId)) state.eliminationOrder.push(playerId);
  }
  state.rollsReceived.delete(playerId);
  if (state.activePlayerId === playerId) state.activePlayerId = nextAliveAfter(state, playerId);
  finishIfOver(state);
  return true;
}

// ---- Client view ----

export function getClientState(roomCode: string, playerId: string, room: Room): LiarsDiceClientState | null {
  const state = games.get(roomCode);
  if (!state) return null;

  const players: LiarsDicePlayerInfo[] = state.seatingOrder.map(id => {
    const pd = state.playerData[id];
    const rp = room.players[id];
    return {
      id,
      name: playerName(state, room, id),
      avatar: playerAvatar(state, room, id),
      lives: pd?.lives ?? 0,
      maxLives: state.settings.lives,
      alive: pd?.alive ?? false,
      connected: rp?.connected ?? false,
      rolled: state.rollsReceived.has(id),
      left: pd?.left ?? true,
    };
  });

  const bid = state.currentBid;
  const inRound = state.roundPlayers.includes(playerId);

  return {
    phase: state.phase,
    players,
    myDice: inRound ? [...(state.playerData[playerId]?.dice ?? [])] : [],
    currentBid: bid ? { ...bid, playerName: playerName(state, room, bid.playerId) } : null,
    activePlayerId: state.activePlayerId,
    isMyTurn: state.phase === 'bidding' && state.activePlayerId === playerId,
    bidHistory: state.bidHistory,
    roundNumber: state.roundNumber,
    lastChallengeResult: state.challengeResult,
    settings: state.settings,
    eliminationOrder: [...state.eliminationOrder],
    totalDiceOnTable: totalDice(state),
    stats: { ...state.stats },
    winnerId: state.winnerId,
  };
}

export function getTurnTimerSnapshot(roomCode: string): LiarsDiceTurnTimer | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'bidding' || !state.turnTimerEnd || !state.turnTimerPlayerId) return null;
  return {
    playerId: state.turnTimerPlayerId,
    secondsLeft: Math.max(0, Math.ceil((state.turnTimerEnd - Date.now()) / 1000)),
    total: state.turnTimerTotal,
  };
}

// ---- Reconnection ----

export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = games.get(roomCode);
  if (!state) return;

  const swap = (id: string) => (id === oldId ? newId : id);

  if (state.playerData[oldId]) {
    state.playerData[newId] = state.playerData[oldId];
    delete state.playerData[oldId];
  }
  if (state.stats[oldId]) {
    state.stats[newId] = state.stats[oldId];
    delete state.stats[oldId];
  }
  state.seatingOrder = state.seatingOrder.map(swap);
  state.roundPlayers = state.roundPlayers.map(swap);
  state.eliminationOrder = state.eliminationOrder.map(swap);
  if (state.activePlayerId) state.activePlayerId = swap(state.activePlayerId);
  if (state.turnTimerPlayerId) state.turnTimerPlayerId = swap(state.turnTimerPlayerId);
  if (state.winnerId) state.winnerId = swap(state.winnerId);
  if (state.currentBid) state.currentBid.playerId = swap(state.currentBid.playerId);
  for (const entry of state.bidHistory) entry.playerId = swap(entry.playerId);
  if (state.rollsReceived.delete(oldId)) state.rollsReceived.add(newId);

  const cr = state.challengeResult;
  if (cr) {
    cr.callerId = swap(cr.callerId);
    cr.bidderId = swap(cr.bidderId);
    cr.loserIds = cr.loserIds.map(swap);
    if (cr.allDice[oldId]) {
      cr.allDice[newId] = cr.allDice[oldId];
      delete cr.allDice[oldId];
    }
  }

  console.log(`[LiarsDice] Swapped player ID ${oldId} → ${newId}`);
}

// ---- Timers (one turn clock + one phase step per room) ----

export function setTurnTimer(roomCode: string, interval: ReturnType<typeof setInterval>): void {
  clearTurnTimer(roomCode);
  turnTimers.set(roomCode, interval);
}

export function clearTurnTimer(roomCode: string): void {
  const t = turnTimers.get(roomCode);
  if (t) {
    clearInterval(t);
    turnTimers.delete(roomCode);
  }
}

export function hasTurnTimer(roomCode: string): boolean {
  return turnTimers.has(roomCode);
}

export function setPhaseTimer(roomCode: string, timeout: ReturnType<typeof setTimeout>): void {
  clearPhaseTimer(roomCode);
  phaseTimers.set(roomCode, timeout);
}

export function clearPhaseTimer(roomCode: string): void {
  const t = phaseTimers.get(roomCode);
  if (t) {
    clearTimeout(t);
    phaseTimers.delete(roomCode);
  }
}

function clearTimers(roomCode: string): void {
  clearTurnTimer(roomCode);
  clearPhaseTimer(roomCode);
}
