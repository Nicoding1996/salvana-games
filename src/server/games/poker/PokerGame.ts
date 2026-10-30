// ============================================
// Poker (Texas Hold'em) — Server Game Logic
// ============================================
// Rules and state only. Pacing (deal delay, all-in runout, next-hand pause,
// turn clocks) is driven by drivePoker() in src/server/socket.ts, which calls
// back in here after every transition.

import type { Room } from '@/types/hub';
import type {
  PokerServerState, PokerClientState, PokerPlayerInfo, PokerPlayerState,
  PokerSettings, Card, Pot, PokerSuperlative, LoggedAction, HandEvaluation,
  PokerHandResult, PokerServerHandResult, PokerTurnTimer,
} from '@/types/games/poker';
import {
  DEFAULT_POKER_SETTINGS, SUITS, RANKS, BLIND_LEVELS, BLIND_INCREASE_HANDS,
  POKER_MIN_PLAYERS, POKER_MAX_PLAYERS, POKER_STARTING_CHIPS, POKER_BLIND_STRUCTURES,
  POKER_STARTING_BLINDS, POKER_TURN_TIMERS, isBettingPhase,
} from '@/types/games/poker';
import { evaluateHand, compareHands } from './handEvaluator';

// ---- In-memory stores ----
const games = new Map<string, PokerServerState>();
const roomTimers = new Map<string, ReturnType<typeof setInterval>>();   // turn clock
const phaseTimers = new Map<string, ReturnType<typeof setTimeout>>();   // deal / runout / next hand

export type ActionResult = { success: true } | { success: false; error: string };
export type NextHandResult = 'dealt' | 'gameOver' | 'stale';

// ---- Public API: lifecycle ----

export function createGame(room: Room, settings?: Partial<PokerSettings>): PokerServerState {
  const mergedSettings = sanitizeSettings(settings);
  const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);

  const playerData: Record<string, PokerPlayerState> = {};
  const names: PokerServerState['names'] = {};
  for (const id of playerIds) {
    playerData[id] = {
      holeCards: [],
      chips: mergedSettings.startingChips,
      currentBet: 0,
      totalBetThisHand: 0,
      folded: false,
      allIn: false,
      alive: true,
      inHand: false,
      stackAtHandStart: mergedSettings.startingChips,
    };
    names[id] = { name: room.players[id].name, avatar: room.players[id].avatar };
  }

  const state: PokerServerState = {
    phase: 'dealing',
    deck: [],
    communityCards: [],
    revealedCommunityCount: 0,
    playerData,
    names,
    seatingOrder: [...playerIds],
    // Random first button so the host doesn't always deal first
    dealerId: playerIds[Math.floor(Math.random() * playerIds.length)],
    smallBlindId: '',
    bigBlindId: '',
    activePlayerId: null,
    currentBet: 0,
    minRaise: 0,
    actedThisRound: new Set<string>(),
    runout: false,
    actionHistory: [],
    handNumber: 1,
    blindLevel: mergedSettings.startingBlinds === '25/50' ? 1 : 0,
    handsAtCurrentLevel: 0,
    settings: mergedSettings,
    eliminationOrder: [],
    handResult: null,
    turnTimerEnd: null,
    turnTimerTotal: 0,
    turnTimerPlayerId: null,
    nextHandAt: null,
    autoActed: new Set<string>(),
    stats: {
      biggestPot: { amount: 0, winnerId: null },
      handsPlayed: {},
      handsWon: {},
      bluffsWon: {},
      eliminations: {},
      foldCount: {},
    },
  };

  games.set(room.code, state);
  dealNewHand(state);
  return state;
}

/** Deal animation finished — open preflop betting. Returns false if the call is stale. */
export function beginBetting(roomCode: string, handNumber: number): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'dealing' || state.handNumber !== handNumber) return false;
  state.phase = 'preflop';
  openBettingRound(state, state.bigBlindId);
  return true;
}

/** All-in runout: reveal the next street, or resolve the showdown after the river. */
export function advanceRunout(roomCode: string, handNumber: number): boolean {
  const state = games.get(roomCode);
  if (!state || !state.runout || !isBettingPhase(state.phase) || state.handNumber !== handNumber) return false;
  if (state.phase === 'river') {
    resolveShowdown(state);
  } else {
    dealNextStreet(state);
  }
  return true;
}

/** Called after the round-end pause: bust players, move the button, deal the next hand. */
export function startNextHand(roomCode: string, handNumber: number): NextHandResult {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'roundEnd' || state.handNumber !== handNumber) return 'stale';

  // Eliminate busted players — a smaller starting stack finishes lower
  const busted = inHandIds(state)
    .filter(id => state.playerData[id].chips <= 0)
    .sort((a, b) => state.playerData[a].stackAtHandStart - state.playerData[b].stackAtHandStart);
  for (const id of busted) {
    state.playerData[id].alive = false;
    const eliminatedBy = knockoutCredit(state, id);
    state.eliminationOrder.push({ id, eliminatedBy });
    if (eliminatedBy) {
      state.stats.eliminations[eliminatedBy] = (state.stats.eliminations[eliminatedBy] || 0) + 1;
    }
  }

  const alive = state.seatingOrder.filter(id => state.playerData[id].alive);
  if (alive.length <= 1) {
    state.phase = 'finished';
    state.activePlayerId = null;
    state.nextHandAt = null;
    return 'gameOver';
  }

  // Blind level progression
  state.handsAtCurrentLevel++;
  const handsToIncrease = BLIND_INCREASE_HANDS[state.settings.blindStructure];
  if (state.handsAtCurrentLevel >= handsToIncrease && state.blindLevel < BLIND_LEVELS.length - 1) {
    state.blindLevel++;
    state.handsAtCurrentLevel = 0;
  }

  // Button moves clockwise to the next player still in the tournament
  state.dealerId = nextSeat(state, state.dealerId, id => state.playerData[id].alive) ?? alive[0];
  state.handNumber++;
  dealNewHand(state);
  return 'dealt';
}

// ---- Public API: actions ----

/** Process a player action. Inputs are untrusted — everything is validated here. */
export function playerAction(roomCode: string, playerId: string, action: unknown, raiseTo?: unknown): ActionResult {
  const state = games.get(roomCode);
  if (!state) return fail('No game in progress');
  if (!isBettingPhase(state.phase) || state.runout) return fail('Not a betting phase');
  if (state.activePlayerId !== playerId) return fail('Not your turn');
  const pd = state.playerData[playerId];
  if (!pd || !canAct(state, playerId)) return fail('Cannot act');

  const toCall = Math.max(0, state.currentBet - pd.currentBet);

  switch (action) {
    case 'fold': {
      pd.folded = true;
      state.stats.foldCount[playerId] = (state.stats.foldCount[playerId] || 0) + 1;
      state.actedThisRound.add(playerId);
      logAction(state, playerId, 'fold', 0);
      break;
    }
    case 'check': {
      if (toCall > 0) return fail('There is a bet to call');
      state.actedThisRound.add(playerId);
      logAction(state, playerId, 'check', 0);
      break;
    }
    case 'call': {
      if (toCall === 0) return fail('Nothing to call');
      const paid = commitChips(pd, toCall);
      state.actedThisRound.add(playerId);
      logAction(state, playerId, pd.allIn ? 'allIn' : 'call', paid);
      break;
    }
    case 'raise': {
      if (typeof raiseTo !== 'number' || !Number.isFinite(raiseTo)) return fail('Invalid raise amount');
      if (!raiseAllowed(state, playerId)) return fail('Nobody left to raise against');
      const target = Math.floor(raiseTo);
      const allInTo = pd.currentBet + pd.chips;
      if (target >= allInTo) {
        betTo(state, playerId, allInTo);
        break;
      }
      const minTo = state.currentBet + state.minRaise;
      if (target < minTo) return fail(`Minimum raise is to ${minTo}`);
      betTo(state, playerId, target);
      break;
    }
    case 'allIn': {
      if (raiseAllowed(state, playerId) || pd.chips <= toCall) {
        betTo(state, playerId, pd.currentBet + pd.chips);
      } else if (toCall > 0) {
        // Can't raise here (short all-in faced, or nobody left to call) — shove = call
        commitChips(pd, toCall);
        state.actedThisRound.add(playerId);
        logAction(state, playerId, pd.allIn ? 'allIn' : 'call', toCall);
      } else {
        state.actedThisRound.add(playerId);
        logAction(state, playerId, 'check', 0);
      }
      break;
    }
    default:
      return fail('Unknown action');
  }

  advanceAfterAction(state, playerId);
  return { success: true };
}

/**
 * The active player's clock ran out (or they're away): check if it's free, otherwise fold.
 * Only acts if it is still `expectedPlayerId`'s turn, so stale timers can't hit someone else.
 */
export function handleDisconnectedTurn(roomCode: string, expectedPlayerId: string, away: boolean): boolean {
  const state = games.get(roomCode);
  if (!state || state.activePlayerId !== expectedPlayerId) return false;
  if (!isBettingPhase(state.phase) || state.runout) return false;
  const pd = state.playerData[expectedPlayerId];
  if (!pd) return false;
  if (away) state.autoActed.add(expectedPlayerId);
  const toCall = state.currentBet - pd.currentBet;
  return playerAction(roomCode, expectedPlayerId, toCall > 0 ? 'fold' : 'check').success;
}

// ---- Public API: queries ----

export function getGameState(roomCode: string): PokerServerState | undefined {
  return games.get(roomCode);
}

export function getActivePlayerId(roomCode: string): string | null {
  return games.get(roomCode)?.activePlayerId ?? null;
}

/** Current turn clock for a client that just (re)joined, or null if none is running. */
export function getTurnTimerSnapshot(roomCode: string): PokerTurnTimer | null {
  const state = games.get(roomCode);
  if (!state || !state.turnTimerEnd || !state.turnTimerPlayerId) return null;
  if (state.activePlayerId !== state.turnTimerPlayerId) return null;
  return {
    playerId: state.turnTimerPlayerId,
    secondsLeft: Math.max(0, Math.ceil((state.turnTimerEnd - Date.now()) / 1000)),
    total: state.turnTimerTotal,
  };
}

/** Get personalized client state for a specific player */
export function getClientState(roomCode: string, playerId: string, room: Room): PokerClientState | null {
  const state = games.get(roomCode);
  if (!state) return null;

  const labelOf = (id: string) => ({
    name: room.players[id]?.name ?? state.names[id]?.name ?? 'Player',
    avatar: room.players[id]?.avatar ?? state.names[id]?.avatar ?? '😎',
  });

  const result = state.phase === 'roundEnd' ? state.handResult : null;
  const tabledIds = new Set<string>();
  if (result && !result.uncontested) {
    for (const hand of result.hands) tabledIds.add(hand.playerId);
  } else if (state.runout && isBettingPhase(state.phase)) {
    for (const id of contenderIds(state)) tabledIds.add(id);
  }

  const players: PokerPlayerInfo[] = state.seatingOrder.map(id => {
    const pd = state.playerData[id];
    const label = labelOf(id);
    return {
      id,
      name: label.name,
      avatar: label.avatar,
      chips: pd.chips,
      currentBet: pd.currentBet,
      totalBetThisHand: pd.totalBetThisHand,
      folded: pd.folded,
      allIn: pd.allIn,
      alive: pd.alive,
      inHand: pd.inHand,
      connected: room.players[id]?.connected ?? false,
      isDealer: id === state.dealerId,
      isSmallBlind: pd.inHand && id === state.smallBlindId,
      isBigBlind: pd.inHand && id === state.bigBlindId,
      holeCards: id !== playerId && tabledIds.has(id) ? pd.holeCards : null,
      knockouts: state.stats.eliminations[id] || 0,
      potsWon: state.stats.handsWon[id] || 0,
    };
  });

  const me = state.playerData[playerId];
  const amIAlive = me?.alive ?? false;
  const inMyHand = !!me && me.inHand;
  const visibleBoard = state.communityCards.slice(0, state.revealedCommunityCount);
  const isMyTurn = isBettingPhase(state.phase) && !state.runout && state.activePlayerId === playerId;

  let myHand: HandEvaluation | null = null;
  if (inMyHand && me.holeCards.length === 2 && state.phase !== 'finished') {
    myHand = evaluateHand([...me.holeCards, ...visibleBoard]);
  }

  const toCall = me ? Math.max(0, state.currentBet - me.currentBet) : 0;
  const pots = state.phase === 'roundEnd' || state.phase === 'finished' ? [] : computePots(state);
  const potTotal = result ? result.potTotal : pots.reduce((sum, p) => sum + p.amount, 0);

  const atTopLevel = state.blindLevel >= BLIND_LEVELS.length - 1;
  const totalSeats = state.seatingOrder.length;
  const winnerId = state.phase === 'finished'
    ? state.seatingOrder.find(id => state.playerData[id].alive) ?? null
    : null;

  return {
    phase: state.phase,
    handNumber: state.handNumber,
    players,
    myCards: inMyHand ? me.holeCards : [],
    myHand,
    communityCards: visibleBoard,
    pots,
    potTotal,
    currentBet: state.currentBet,
    activePlayerId: isBettingPhase(state.phase) && !state.runout ? state.activePlayerId : null,
    isMyTurn,
    amIAlive,
    callAmount: me ? Math.min(toCall, me.chips) : 0,
    minRaiseTo: state.currentBet + state.minRaise,
    maxRaiseTo: me ? me.currentBet + me.chips : 0,
    canRaise: isMyTurn && raiseAllowed(state, playerId),
    smallBlind: BLIND_LEVELS[state.blindLevel],
    bigBlind: BLIND_LEVELS[state.blindLevel] * 2,
    blindsUp: state.handNumber > 1 && state.handsAtCurrentLevel === 0,
    nextBlindIncrease: atTopLevel
      ? null
      : Math.max(1, BLIND_INCREASE_HANDS[state.settings.blindStructure] - state.handsAtCurrentLevel),
    runout: state.runout && isBettingPhase(state.phase),
    actionHistory: state.actionHistory,
    handResult: result ? toClientHandResult(result, labelOf) : null,
    nextHandInMs: state.phase === 'roundEnd' && state.nextHandAt
      ? Math.max(0, state.nextHandAt - Date.now())
      : null,
    eliminationOrder: state.eliminationOrder.map((e, i) => ({
      id: e.id,
      name: labelOf(e.id).name,
      avatar: labelOf(e.id).avatar,
      place: totalSeats - i,
      eliminatedBy: e.eliminatedBy ? labelOf(e.eliminatedBy).name : null,
    })),
    winnerId,
    superlatives: state.phase === 'finished' ? buildSuperlatives(state, id => labelOf(id).name) : [],
    settings: state.settings,
  };
}

// ---- Public API: housekeeping ----

export function endGame(roomCode: string): void {
  clearRoomTimer(roomCode);
  clearPhaseTimer(roomCode);
  games.delete(roomCode);
}

/** Turn clock (interval) — one per room */
export function setRoomTimer(roomCode: string, interval: ReturnType<typeof setInterval>): void {
  clearRoomTimer(roomCode);
  roomTimers.set(roomCode, interval);
}

export function clearRoomTimer(roomCode: string): void {
  const timer = roomTimers.get(roomCode);
  if (timer) {
    clearInterval(timer);
    roomTimers.delete(roomCode);
  }
}

export function hasRoomTimer(roomCode: string): boolean {
  return roomTimers.has(roomCode);
}

/** Deal / runout / next-hand timeout — one per room, so steps can never double-fire */
export function setPhaseTimer(roomCode: string, timeout: ReturnType<typeof setTimeout>): void {
  clearPhaseTimer(roomCode);
  phaseTimers.set(roomCode, timeout);
}

export function clearPhaseTimer(roomCode: string): void {
  const timer = phaseTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    phaseTimers.delete(roomCode);
  }
}

/** Swap player ID on reconnection */
export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = games.get(roomCode);
  if (!state || !state.playerData[oldId]) return;

  const swap = (id: string) => (id === oldId ? newId : id);
  const swapKey = <T>(record: Record<string, T>) => {
    if (oldId in record) {
      record[newId] = record[oldId];
      delete record[oldId];
    }
  };

  swapKey(state.playerData);
  swapKey(state.names);
  state.seatingOrder = state.seatingOrder.map(swap);
  state.dealerId = swap(state.dealerId);
  state.smallBlindId = swap(state.smallBlindId);
  state.bigBlindId = swap(state.bigBlindId);
  if (state.activePlayerId) state.activePlayerId = swap(state.activePlayerId);
  if (state.turnTimerPlayerId) state.turnTimerPlayerId = swap(state.turnTimerPlayerId);

  if (state.actedThisRound.delete(oldId)) state.actedThisRound.add(newId);
  // Back at the table — next time they're away they get the full grace period again
  state.autoActed.delete(oldId);

  for (const entry of state.actionHistory) entry.playerId = swap(entry.playerId);
  for (const entry of state.eliminationOrder) {
    entry.id = swap(entry.id);
    if (entry.eliminatedBy) entry.eliminatedBy = swap(entry.eliminatedBy);
  }

  if (state.handResult) {
    for (const pot of state.handResult.pots) {
      pot.eligiblePlayerIds = pot.eligiblePlayerIds.map(swap);
      pot.winnerIds = pot.winnerIds.map(swap);
    }
    swapKey(state.handResult.winnings);
    for (const hand of state.handResult.hands) hand.playerId = swap(hand.playerId);
  }

  swapKey(state.stats.handsPlayed);
  swapKey(state.stats.handsWon);
  swapKey(state.stats.bluffsWon);
  swapKey(state.stats.eliminations);
  swapKey(state.stats.foldCount);
  if (state.stats.biggestPot.winnerId === oldId) state.stats.biggestPot.winnerId = newId;
}

// ---- Hand flow (private) ----

/** Shuffle, deal hole cards + board, post blinds. Leaves the hand in 'dealing'. */
function dealNewHand(state: PokerServerState): void {
  state.deck = createShuffledDeck();
  state.communityCards = [];
  state.revealedCommunityCount = 0;
  state.currentBet = 0;
  state.minRaise = bigBlindOf(state);
  state.actedThisRound = new Set<string>();
  state.runout = false;
  state.actionHistory = [];
  state.handResult = null;
  state.nextHandAt = null;
  state.activePlayerId = null;

  for (const id of state.seatingOrder) {
    const pd = state.playerData[id];
    pd.holeCards = [];
    pd.currentBet = 0;
    pd.totalBetThisHand = 0;
    pd.folded = false;
    pd.allIn = false;
    pd.inHand = pd.alive;
    pd.stackAtHandStart = pd.chips;
  }

  // One card at a time, starting left of the button
  const dealOrder = seatsAfter(state, state.dealerId).filter(id => state.playerData[id].inHand);
  for (let round = 0; round < 2; round++) {
    for (const id of dealOrder) state.playerData[id].holeCards.push(state.deck.pop()!);
  }

  // Board up front (burn before each street), revealed progressively
  state.deck.pop();
  state.communityCards.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
  state.deck.pop();
  state.communityCards.push(state.deck.pop()!);
  state.deck.pop();
  state.communityCards.push(state.deck.pop()!);

  postBlinds(state);

  for (const id of dealOrder) {
    state.stats.handsPlayed[id] = (state.stats.handsPlayed[id] || 0) + 1;
  }

  state.phase = 'dealing';
}

function postBlinds(state: PokerServerState): void {
  const smallBlind = BLIND_LEVELS[state.blindLevel];
  const bigBlind = smallBlind * 2;
  const inHand = (id: string) => state.playerData[id].inHand;

  if (inHandIds(state).length === 2) {
    // Heads-up: the button posts the small blind and acts first preflop
    state.smallBlindId = state.dealerId;
    state.bigBlindId = nextSeat(state, state.dealerId, inHand)!;
  } else {
    state.smallBlindId = nextSeat(state, state.dealerId, inHand)!;
    state.bigBlindId = nextSeat(state, state.smallBlindId, inHand)!;
  }

  postForcedBet(state, state.smallBlindId, smallBlind, 'smallBlind');
  postForcedBet(state, state.bigBlindId, bigBlind, 'bigBlind');

  // A short all-in big blind doesn't lower the price — everyone still calls a full blind
  state.currentBet = bigBlind;
  state.minRaise = bigBlind;
}

function postForcedBet(state: PokerServerState, id: string, amount: number, kind: 'smallBlind' | 'bigBlind'): void {
  const paid = commitChips(state.playerData[id], amount);
  logAction(state, id, kind, paid, 'preflop');
}

/** Hand the action to the first player after `afterId` who can act — or close betting if nobody needs to. */
function openBettingRound(state: PokerServerState, afterId: string): void {
  if (isBettingClosed(state)) {
    startRunout(state);
    return;
  }
  state.activePlayerId = nextSeat(state, afterId, id => canAct(state, id));
}

/** Put the player's street bet up to `target` (opening bet, raise, or all-in). */
function betTo(state: PokerServerState, id: string, target: number): void {
  const pd = state.playerData[id];
  const previousBet = state.currentBet;
  const paid = commitChips(pd, target - pd.currentBet);
  const increment = pd.currentBet - previousBet;

  if (increment > 0) {
    state.currentBet = pd.currentBet;
    if (increment >= state.minRaise) {
      // Full raise: sets the new minimum and reopens raising for everyone else
      state.minRaise = increment;
      state.actedThisRound = new Set<string>([id]);
    } else {
      // Short all-in raise: others must call or fold, but players who already
      // acted can't re-raise (they stay in actedThisRound)
      state.actedThisRound.add(id);
    }
  } else {
    state.actedThisRound.add(id); // all-in for no more than a call
  }

  const action: LoggedAction = pd.allIn ? 'allIn' : previousBet === 0 ? 'bet' : 'raise';
  logAction(state, id, action, paid);
}

function advanceAfterAction(state: PokerServerState, actorId: string): void {
  const contenders = contenderIds(state);
  if (contenders.length === 1) {
    finishUncontested(state, contenders[0]);
    return;
  }

  const actors = contenders.filter(id => !state.playerData[id].allIn);
  const roundComplete = actors.every(id =>
    state.actedThisRound.has(id) && state.playerData[id].currentBet === state.currentBet
  );

  if (roundComplete) {
    closeStreet(state);
  } else if (isBettingClosed(state)) {
    startRunout(state);
  } else {
    state.activePlayerId = nextSeat(state, actorId, id => canAct(state, id));
  }
}

function closeStreet(state: PokerServerState): void {
  returnUncalledBet(state);
  if (state.phase === 'river') {
    resolveShowdown(state);
    return;
  }
  if (isBettingClosed(state)) {
    startRunout(state);
    return;
  }
  dealNextStreet(state);
  openBettingRound(state, state.dealerId);
}

/** Move to the next street: clear street bets and reveal cards. */
function dealNextStreet(state: PokerServerState): void {
  for (const id of state.seatingOrder) state.playerData[id].currentBet = 0;
  state.currentBet = 0;
  state.minRaise = bigBlindOf(state);
  state.actedThisRound = new Set<string>();

  if (state.phase === 'preflop') {
    state.phase = 'flop';
    state.revealedCommunityCount = 3;
  } else if (state.phase === 'flop') {
    state.phase = 'turn';
    state.revealedCommunityCount = 4;
  } else if (state.phase === 'turn') {
    state.phase = 'river';
    state.revealedCommunityCount = 5;
  }

  state.activePlayerId = null; // openBettingRound picks the first actor (unless running out)
}

/** No more betting possible but cards to come — table the hands and run it out. */
function startRunout(state: PokerServerState): void {
  returnUncalledBet(state);
  state.activePlayerId = null;
  state.runout = true;
}

/**
 * Nobody (or only one player, who already covers every bet) can still act,
 * so there's nothing left to bet on this hand.
 */
function isBettingClosed(state: PokerServerState): boolean {
  const contenders = contenderIds(state);
  const actors = contenders.filter(id => !state.playerData[id].allIn);
  if (actors.length === 0) return true;
  if (actors.length > 1) return false;
  const actorBet = state.playerData[actors[0]].currentBet;
  const highestOther = Math.max(0, ...contenders
    .filter(id => id !== actors[0])
    .map(id => state.playerData[id].currentBet));
  return actorBet >= highestOther;
}

/** Chips nobody can match go straight back to the bettor. */
function returnUncalledBet(state: PokerServerState): void {
  const ids = inHandIds(state);
  if (ids.length < 2) return;
  const sorted = [...ids].sort((a, b) =>
    state.playerData[b].totalBetThisHand - state.playerData[a].totalBetThisHand
  );
  const top = state.playerData[sorted[0]];
  const excess = top.totalBetThisHand - state.playerData[sorted[1]].totalBetThisHand;
  if (excess <= 0) return;

  top.chips += excess;
  top.totalBetThisHand -= excess;
  top.currentBet = Math.max(0, top.currentBet - excess);
  if (top.chips > 0) top.allIn = false;
  state.currentBet = Math.max(0, ...ids.map(id => state.playerData[id].currentBet));
}

/** Build main + side pots from everyone's total contribution this hand. */
function computePots(state: PokerServerState): Pot[] {
  const ids = inHandIds(state);
  const contenders = ids.filter(id => !state.playerData[id].folded);
  const total = (id: string) => state.playerData[id].totalBetThisHand;
  const maxTotal = Math.max(0, ...ids.map(total));
  if (maxTotal === 0) return [];

  const levels = [...new Set(contenders.filter(id => state.playerData[id].allIn).map(total))]
    .filter(level => level > 0)
    .sort((a, b) => a - b);
  if (levels.length === 0 || levels[levels.length - 1] < maxTotal) levels.push(maxTotal);

  const pots: Pot[] = [];
  let floor = 0;
  for (const level of levels) {
    let amount = 0;
    for (const id of ids) amount += Math.max(0, Math.min(total(id), level) - floor);
    floor = level;
    if (amount === 0) continue;

    const eligible = contenders.filter(id => total(id) >= level);
    const last = pots[pots.length - 1];
    if (last && (eligible.length === 0 || sameIds(last.eligiblePlayerIds, eligible))) {
      last.amount += amount; // same contenders (or dead money above everyone) — one pot
    } else {
      pots.push({ amount, eligiblePlayerIds: eligible.length > 0 ? eligible : contenders });
    }
  }
  return pots;
}

function resolveShowdown(state: PokerServerState): void {
  returnUncalledBet(state);
  state.revealedCommunityCount = 5;
  const board = state.communityCards.slice(0, 5);
  const contenders = contenderIds(state);

  const evaluations = new Map<string, HandEvaluation>();
  for (const id of contenders) {
    evaluations.set(id, evaluateHand([...state.playerData[id].holeCards, ...board]));
  }

  const pots = computePots(state);
  const winnings: Record<string, number> = {};
  const potResults: PokerServerHandResult['pots'] = [];

  for (const pot of pots) {
    const eligible = pot.eligiblePlayerIds.filter(id => evaluations.has(id));
    if (eligible.length === 0) continue;

    let bestIds = [eligible[0]];
    let bestEval = evaluations.get(eligible[0])!;
    for (const id of eligible.slice(1)) {
      const cmp = compareHands(evaluations.get(id)!, bestEval);
      if (cmp > 0) {
        bestIds = [id];
        bestEval = evaluations.get(id)!;
      } else if (cmp === 0) {
        bestIds.push(id);
      }
    }

    // Split evenly; odd chips go to the first winner clockwise from the button
    const winners = seatsAfter(state, state.dealerId).filter(id => bestIds.includes(id));
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const id of winners) {
      const amount = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      winnings[id] = (winnings[id] || 0) + amount;
      state.playerData[id].chips += amount;
    }
    potResults.push({ amount: pot.amount, eligiblePlayerIds: pot.eligiblePlayerIds, winnerIds: winners });
  }

  const potTotal = pots.reduce((sum, p) => sum + p.amount, 0);
  recordWin(state, winnings, potTotal);

  const hands = contenders
    .map(id => ({ playerId: id, holeCards: state.playerData[id].holeCards, evaluation: evaluations.get(id)! }))
    .sort((a, b) => compareHands(b.evaluation, a.evaluation));

  state.handResult = {
    uncontested: false,
    potTotal,
    pots: potResults,
    winnings,
    hands,
    winningCards: hands[0]?.evaluation.bestCards ?? [],
  };
  endHand(state);
}

/** Everyone else folded — winner takes it without showing. */
function finishUncontested(state: PokerServerState, winnerId: string): void {
  returnUncalledBet(state);
  const potTotal = computePots(state).reduce((sum, p) => sum + p.amount, 0);
  const winner = state.playerData[winnerId];
  winner.chips += potTotal;

  // "Bluff": took a post-flop pot uncontested while holding nothing
  if (state.revealedCommunityCount >= 3) {
    const board = state.communityCards.slice(0, state.revealedCommunityCount);
    if (evaluateHand([...winner.holeCards, ...board]).rankIndex === 0) {
      state.stats.bluffsWon[winnerId] = (state.stats.bluffsWon[winnerId] || 0) + 1;
    }
  }

  recordWin(state, { [winnerId]: potTotal }, potTotal);
  state.handResult = {
    uncontested: true,
    potTotal,
    pots: [{ amount: potTotal, eligiblePlayerIds: [winnerId], winnerIds: [winnerId] }],
    winnings: { [winnerId]: potTotal },
    hands: [],
    winningCards: [],
  };
  endHand(state);
}

function recordWin(state: PokerServerState, winnings: Record<string, number>, potTotal: number): void {
  for (const id of Object.keys(winnings)) {
    state.stats.handsWon[id] = (state.stats.handsWon[id] || 0) + 1;
  }
  if (potTotal > state.stats.biggestPot.amount) {
    const topWinner = Object.entries(winnings).sort((a, b) => b[1] - a[1])[0];
    state.stats.biggestPot = { amount: potTotal, winnerId: topWinner?.[0] ?? null };
  }
}

function endHand(state: PokerServerState): void {
  for (const id of state.seatingOrder) state.playerData[id].currentBet = 0;
  state.currentBet = 0;
  state.activePlayerId = null;
  state.runout = false;
  state.phase = 'roundEnd';
}

/** Credit a knockout to whoever won the deepest pot the busted player was in. */
function knockoutCredit(state: PokerServerState, bustedId: string): string | null {
  const pots = state.handResult?.pots ?? [];
  for (let i = pots.length - 1; i >= 0; i--) {
    if (pots[i].eligiblePlayerIds.includes(bustedId)) {
      return pots[i].winnerIds.find(id => id !== bustedId) ?? null;
    }
  }
  return null;
}

// ---- Presentation helpers (private) ----

function toClientHandResult(
  result: PokerServerHandResult,
  labelOf: (id: string) => { name: string; avatar: string },
): PokerHandResult {
  const handById = new Map(result.hands.map(h => [h.playerId, h]));
  return {
    uncontested: result.uncontested,
    potTotal: result.potTotal,
    winners: Object.entries(result.winnings)
      .sort((a, b) => b[1] - a[1])
      .map(([id, amount]) => ({
        playerId: id,
        playerName: labelOf(id).name,
        avatar: labelOf(id).avatar,
        amount,
        handDescription: handById.get(id)?.evaluation.description ?? null,
      })),
    hands: result.hands.map(h => ({
      playerId: h.playerId,
      playerName: labelOf(h.playerId).name,
      avatar: labelOf(h.playerId).avatar,
      holeCards: h.holeCards,
      handEvaluation: h.evaluation,
      amountWon: result.winnings[h.playerId] || 0,
      isWinner: (result.winnings[h.playerId] || 0) > 0,
    })),
    winningCards: result.winningCards,
  };
}

function buildSuperlatives(state: PokerServerState, nameOf: (id: string) => string): PokerSuperlative[] {
  const superlatives: PokerSuperlative[] = [];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const topBluffer = topEntry(state.stats.bluffsWon);
  if (topBluffer) {
    superlatives.push({
      emoji: '🎭', title: 'Biggest Bluffer',
      playerId: topBluffer[0], playerName: nameOf(topBluffer[0]),
      value: `${plural(topBluffer[1], 'pot')} taken with nothing`,
    });
  }

  if (state.stats.biggestPot.winnerId) {
    superlatives.push({
      emoji: '💰', title: 'High Roller',
      playerId: state.stats.biggestPot.winnerId,
      playerName: nameOf(state.stats.biggestPot.winnerId),
      value: `Won a ${state.stats.biggestPot.amount.toLocaleString('en-US')} chip pot`,
    });
  }

  // Fold rates — everyone dealt 3+ hands counts, including players who never folded
  const rates = state.seatingOrder
    .filter(id => (state.stats.handsPlayed[id] || 0) >= 3)
    .map(id => ({ id, rate: (state.stats.foldCount[id] || 0) / state.stats.handsPlayed[id] }));
  if (rates.length >= 2) {
    const tightest = [...rates].sort((a, b) => b.rate - a.rate)[0];
    const loosest = [...rates].sort((a, b) => a.rate - b.rate)[0];
    if (tightest.rate > 0.3) {
      superlatives.push({
        emoji: '🧊', title: 'Ice Cold',
        playerId: tightest.id, playerName: nameOf(tightest.id),
        value: `Folded ${Math.round(tightest.rate * 100)}% of hands`,
      });
    }
    if (loosest.id !== tightest.id) {
      superlatives.push({
        emoji: '🔥', title: 'Loose Cannon',
        playerId: loosest.id, playerName: nameOf(loosest.id),
        value: loosest.rate === 0 ? 'Never folded' : `Folded only ${Math.round(loosest.rate * 100)}% of hands`,
      });
    }
  }

  const topHunter = topEntry(state.stats.eliminations);
  if (topHunter) {
    superlatives.push({
      emoji: '💀', title: 'Bounty Hunter',
      playerId: topHunter[0], playerName: nameOf(topHunter[0]),
      value: plural(topHunter[1], 'knockout'),
    });
  }

  return superlatives;
}

// ---- Small helpers (private) ----

function fail(error: string): ActionResult {
  return { success: false, error };
}

function sanitizeSettings(input: Partial<PokerSettings> | undefined): PokerSettings {
  const settings: PokerSettings = { ...DEFAULT_POKER_SETTINGS };
  if (!input || typeof input !== 'object') return settings;

  if (typeof input.maxPlayers === 'number' && Number.isInteger(input.maxPlayers)) {
    settings.maxPlayers = Math.min(POKER_MAX_PLAYERS, Math.max(POKER_MIN_PLAYERS, input.maxPlayers));
  }
  const chips = POKER_STARTING_CHIPS.find(v => v === input.startingChips);
  if (chips) settings.startingChips = chips;
  const structure = POKER_BLIND_STRUCTURES.find(v => v === input.blindStructure);
  if (structure) settings.blindStructure = structure;
  const blinds = POKER_STARTING_BLINDS.find(v => v === input.startingBlinds);
  if (blinds) settings.startingBlinds = blinds;
  const timer = POKER_TURN_TIMERS.find(v => v === input.turnTimer);
  if (timer !== undefined) settings.turnTimer = timer;
  if (typeof input.bountyMode === 'boolean') settings.bountyMode = input.bountyMode;
  return settings;
}

function bigBlindOf(state: PokerServerState): number {
  return BLIND_LEVELS[state.blindLevel] * 2;
}

function inHandIds(state: PokerServerState): string[] {
  return state.seatingOrder.filter(id => state.playerData[id].inHand);
}

function contenderIds(state: PokerServerState): string[] {
  return inHandIds(state).filter(id => !state.playerData[id].folded);
}

function canAct(state: PokerServerState, id: string): boolean {
  const pd = state.playerData[id];
  return !!pd && pd.inHand && !pd.folded && !pd.allIn;
}

/**
 * Raising needs chips beyond the call, at least one opponent who could still
 * call it, and an open action: a player who already acted since the last full
 * raise is only facing a short all-in and may just call or fold.
 */
function raiseAllowed(state: PokerServerState, id: string): boolean {
  const pd = state.playerData[id];
  if (!pd) return false;
  const toCall = Math.max(0, state.currentBet - pd.currentBet);
  if (pd.chips <= toCall) return false;
  if (state.actedThisRound.has(id)) return false;
  return contenderIds(state).some(other => other !== id && !state.playerData[other].allIn);
}

/** Seats clockwise starting after `id` (ending with `id` itself). */
function seatsAfter(state: PokerServerState, id: string): string[] {
  const i = state.seatingOrder.indexOf(id);
  return [...state.seatingOrder.slice(i + 1), ...state.seatingOrder.slice(0, i + 1)];
}

function nextSeat(state: PokerServerState, fromId: string, predicate: (id: string) => boolean): string | null {
  return seatsAfter(state, fromId).find(predicate) ?? null;
}

/** Move chips from stack to the street bet (capped at the stack). Returns chips paid. */
function commitChips(pd: PokerPlayerState, amount: number): number {
  const paid = Math.max(0, Math.min(amount, pd.chips));
  pd.chips -= paid;
  pd.currentBet += paid;
  pd.totalBetThisHand += paid;
  if (pd.chips === 0) pd.allIn = true;
  return paid;
}

function logAction(
  state: PokerServerState,
  id: string,
  action: LoggedAction,
  amount: number,
  phase = state.phase,
): void {
  state.actionHistory.push({
    playerId: id,
    playerName: state.names[id]?.name ?? 'Player',
    action,
    amount,
    totalBet: state.playerData[id].currentBet,
    phase,
  });
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(id => b.includes(id));
}

function topEntry(record: Record<string, number>): [string, number] | null {
  const top = Object.entries(record).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top : null;
}

/** Create a shuffled 52-card deck (Fisher-Yates) */
function createShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
