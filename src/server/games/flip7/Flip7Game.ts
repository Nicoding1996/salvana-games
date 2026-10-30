// ============================================
// Flip 7 — Server Game Logic
// ============================================

import type { Room } from '@/types/hub';
import {
  type Flip7ServerState,
  type Flip7ServerPlayerData,
  type Flip7ClientState,
  type Flip7PlayerInfo,
  type Flip7Settings,
  type Flip7RoundScore,
  type Card,
  type FlipResult,
  type PendingAction,
  type ActivityLogEntry,
  DEFAULT_FLIP7_SETTINGS,
  DECK_COMPOSITION,
  FLIP_7_CARD_COUNT,
  FLIP7_TARGET_SCORES,
  FLIP7_TURN_TIMERS,
  FLIP7_MIN_PLAYERS,
  FLIP7_MAX_PLAYERS,
  computeRoundScore,
} from '@/types/games/flip7';

// ---- Module-scoped state ----

const games = new Map<string, Flip7ServerState>();
const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

/** What the turn flow should do after a state change. */
export type TurnOutcome = 'continue' | 'roundEnd';

// ---- Settings ----

/** Clamp host-provided settings to the allowed options (input arrives from the client). */
function sanitizeSettings(input?: Partial<Flip7Settings>): Flip7Settings {
  const settings: Flip7Settings = { ...DEFAULT_FLIP7_SETTINGS };
  if (!input || typeof input !== 'object') return settings;

  const target = FLIP7_TARGET_SCORES.find(t => t === input.targetScore);
  if (target !== undefined) settings.targetScore = target;

  const timer = FLIP7_TURN_TIMERS.find(t => t === input.turnTimer);
  if (timer !== undefined) settings.turnTimer = timer;

  if (input.mode === 'classic' || input.mode === 'chaos') settings.mode = input.mode;

  if (typeof input.maxPlayers === 'number' && Number.isInteger(input.maxPlayers)) {
    settings.maxPlayers = Math.min(FLIP7_MAX_PLAYERS, Math.max(FLIP7_MIN_PLAYERS, input.maxPlayers));
  }
  return settings;
}

// ---- Deck Construction ----

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildDeck(mode: 'classic' | 'chaos'): Card[] {
  const cards: Card[] = [];

  // Number cards (pyramid distribution)
  for (const { value, count } of DECK_COMPOSITION.numbers) {
    for (let i = 0; i < count; i++) {
      cards.push({ type: 'number', value });
    }
  }

  // Action cards (skip Freeze & FlipThree in chaos mode)
  for (const { kind, count } of DECK_COMPOSITION.actions) {
    if (mode === 'chaos' && (kind === 'freeze' || kind === 'flipThree')) continue;
    for (let i = 0; i < count; i++) {
      cards.push({ type: 'action', kind });
    }
  }

  // Modifier cards
  for (const { kind, count } of DECK_COMPOSITION.modifiers) {
    for (let i = 0; i < count; i++) {
      cards.push({ type: 'modifier', kind });
    }
  }

  shuffleArray(cards);
  return cards;
}

/** Draw the top card. Reshuffles the discard pile when the deck runs out. */
function drawCard(state: Flip7ServerState): Card {
  if (state.deck.length === 0) {
    state.deck = state.discardPile;
    state.discardPile = [];
    shuffleArray(state.deck);
    console.log(`[Flip7] Deck exhausted, reshuffled ${state.deck.length} cards from discard`);
  }
  if (state.deck.length === 0) {
    // Every card is in someone's hand. Open a fresh deck so play can continue.
    state.deck = buildDeck(state.settings.mode);
    console.log('[Flip7] Deck and discard both empty, opened a fresh deck');
  }
  return state.deck.pop()!;
}

// ---- Helpers ----

function getActivePlayers(state: Flip7ServerState): string[] {
  return state.turnOrder.filter(id => state.playerData[id]?.roundStatus === 'active');
}

/** Move the turn to the next active player (clockwise), or report that the round is over. */
function advanceTurn(state: Flip7ServerState): TurnOutcome {
  state.pendingAction = null;

  if (state.flipSevenAchievedBy) return 'roundEnd';
  if (getActivePlayers(state).length === 0) return 'roundEnd';

  for (let attempts = 0; attempts < state.turnOrder.length; attempts++) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.turnOrder.length;
    if (state.playerData[state.turnOrder[state.currentPlayerIndex]]?.roundStatus === 'active') {
      return 'continue';
    }
  }
  return 'roundEnd';
}

/**
 * Apply a card to a player's hand. Used for regular hits, Flip Three draws and
 * chaos resolution. Freeze / Flip Three drawn as a side effect don't chain;
 * they're discarded.
 */
function resolveCardForPlayer(
  state: Flip7ServerState,
  playerId: string,
  card: Card,
): { result: FlipResult; flipSeven: boolean } {
  const pd = state.playerData[playerId];

  if (card.type === 'number') {
    if (pd.numberCards.some(c => c.value === card.value)) {
      state.discardPile.push(card);
      if (pd.secondChances > 0) {
        pd.secondChances--;
        state.discardPile.push({ type: 'action', kind: 'secondChance' });
        return { result: 'secondChance', flipSeven: false };
      }
      pd.roundStatus = 'busted';
      pd.bustCard = card;
      return { result: 'bust', flipSeven: false };
    }
    pd.numberCards.push(card);
    const flipSeven = pd.numberCards.length >= FLIP_7_CARD_COUNT;
    if (flipSeven && !state.flipSevenAchievedBy) {
      state.flipSevenAchievedBy = playerId;
    }
    return { result: 'safe', flipSeven };
  }

  if (card.type === 'modifier') {
    pd.modifiers.push(card.kind);
    return { result: 'safe', flipSeven: false };
  }

  if (card.kind === 'secondChance') {
    pd.secondChances++;
  } else {
    state.discardPile.push(card);
  }
  return { result: 'safe', flipSeven: false };
}

/** Chance (0–1) that the next card duplicates one of this player's numbers. */
function bustChance(state: Flip7ServerState, pd: Flip7ServerPlayerData): number | null {
  if (pd.roundStatus !== 'active') return null;
  const pile = state.deck.length > 0 ? state.deck : state.discardPile;
  if (pile.length === 0 || pd.numberCards.length === 0) return 0;
  const held = new Set(pd.numberCards.map(c => c.value));
  let dangerous = 0;
  for (const card of pile) {
    if (card.type === 'number' && held.has(card.value)) dangerous++;
  }
  return dangerous / pile.length;
}

// ---- Public API: createGame ----

export function createGame(room: Room, settings?: Partial<Flip7Settings>): Flip7ServerState {
  const mergedSettings = sanitizeSettings(settings);

  // Build seating order from connected players (shuffled for random turn order)
  const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);
  shuffleArray(playerIds);

  const playerData: Record<string, Flip7ServerPlayerData> = {};
  const cumulativeScores: Record<string, number> = {};
  for (const id of playerIds) {
    playerData[id] = {
      numberCards: [],
      modifiers: [],
      secondChances: 0,
      roundStatus: 'active',
      bustCard: null,
    };
    cumulativeScores[id] = 0;
  }

  const state: Flip7ServerState = {
    phase: 'dealing',
    deck: buildDeck(mergedSettings.mode),
    discardPile: [],
    playerData,
    turnOrder: [...playerIds],
    currentPlayerIndex: 0,
    dealerIndex: 0,
    round: 1,
    cumulativeScores,
    settings: mergedSettings,
    turnTimerEnd: null,
    pendingAction: null,
    activityLog: [],
    flipSevenAchievedBy: null,
    chaosChoices: mergedSettings.mode === 'chaos' ? {} : null,
    departed: [],
    lastRoundScores: null,
    lastWinnerId: null,
    roundHistory: [],
  };

  games.set(room.code, state);
  console.log(`[Flip7] Game created in ${room.code} with ${playerIds.length} players, mode: ${mergedSettings.mode}`);
  return state;
}

// ---- Public API: dealInitialCards ----
// Deals one card to each player (clockwise from the dealer's left) and starts play.
// Freeze / Flip Three are slid to the bottom of the deck instead of being dealt.

export function dealInitialCards(roomCode: string): TurnOutcome | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'dealing') return null;

  const len = state.turnOrder.length;
  for (let i = 1; i <= len; i++) {
    const playerId = state.turnOrder[(state.dealerIndex + i) % len];
    const pd = state.playerData[playerId];
    if (!pd) continue;

    // Players who left sit the round out
    if (state.departed.includes(playerId)) {
      pd.roundStatus = 'stayed';
      continue;
    }

    let card = drawCard(state);
    for (let attempts = 0; attempts < 20 && card.type === 'action' && card.kind !== 'secondChance'; attempts++) {
      state.deck.unshift(card);
      card = drawCard(state);
    }
    resolveCardForPlayer(state, playerId, card);
  }

  state.phase = 'playing';
  // First turn goes to the first active player left of the dealer
  state.currentPlayerIndex = state.dealerIndex;
  const outcome = advanceTurn(state);
  if (outcome === 'roundEnd') {
    // Nobody can play (everyone left). Park on the dealer and let the round end.
    state.currentPlayerIndex = state.dealerIndex;
  }
  return outcome;
}

// ---- Public API: hit ----

export interface HitResult {
  card: Card;
  result: FlipResult;
  flipSeven: boolean;
  turnResult: TurnOutcome;
  pendingAction: PendingAction | null;
}

export function hit(roomCode: string, playerId: string): HitResult | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || state.settings.mode !== 'classic') return null;
  // Round is ending, or the drawer still has to pick a target (blocks double-taps)
  if (state.flipSevenAchievedBy || state.pendingAction) return null;
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) return null;

  const pd = state.playerData[playerId];
  if (!pd || pd.roundStatus !== 'active') return null;

  const card = drawCard(state);

  // Freeze / Flip Three: the drawer picks a target (any active player, including themselves)
  if (card.type === 'action' && (card.kind === 'freeze' || card.kind === 'flipThree')) {
    state.discardPile.push(card);
    state.pendingAction = {
      cardKind: card.kind,
      drawerId: playerId,
      eligibleTargets: getActivePlayers(state),
    };
    return { card, result: 'safe', flipSeven: false, turnResult: 'continue', pendingAction: state.pendingAction };
  }

  // Everything else resolves immediately, and the turn passes (one card per turn)
  const { result, flipSeven } = resolveCardForPlayer(state, playerId, card);
  const turnResult = flipSeven ? 'roundEnd' : advanceTurn(state);
  return { card, result, flipSeven, turnResult, pendingAction: null };
}

// ---- Public API: stay ----
// Also used for auto-stays (turn timer expiry, disconnect grace).

export function stay(roomCode: string, playerId: string): TurnOutcome | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || state.settings.mode !== 'classic') return null;
  if (state.flipSevenAchievedBy || state.pendingAction) return null;
  if (state.turnOrder[state.currentPlayerIndex] !== playerId) return null;

  const pd = state.playerData[playerId];
  if (!pd || pd.roundStatus !== 'active') return null;

  pd.roundStatus = 'stayed';
  return advanceTurn(state);
}

// ---- Public API: useAction (resolve Freeze or Flip Three) ----

export interface ActionResult {
  type: 'freeze' | 'flipThree';
  drawerId: string;
  targetId: string;
  flipThreeResults: { card: Card; result: FlipResult; flipSeven: boolean }[];
  turnResult: TurnOutcome;
}

export function resolveAction(roomCode: string, playerId: string, targetId: string): ActionResult | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || !state.pendingAction) return null;
  const pending = state.pendingAction;
  if (pending.drawerId !== playerId) return null;
  if (!pending.eligibleTargets.includes(targetId)) return null;

  const targetPd = state.playerData[targetId];
  if (!targetPd || targetPd.roundStatus !== 'active') return null;

  state.pendingAction = null;
  const flipThreeResults: ActionResult['flipThreeResults'] = [];

  if (pending.cardKind === 'freeze') {
    targetPd.roundStatus = 'frozen';
  } else {
    for (let i = 0; i < 3; i++) {
      if (targetPd.roundStatus !== 'active') break;
      if (targetPd.numberCards.length >= FLIP_7_CARD_COUNT) break;
      const card = drawCard(state);
      const resolved = resolveCardForPlayer(state, targetId, card);
      flipThreeResults.push({ card, ...resolved });
      if (resolved.flipSeven) break;
    }
  }

  const turnResult = state.flipSevenAchievedBy ? 'roundEnd' : advanceTurn(state);
  return { type: pending.cardKind, drawerId: playerId, targetId, flipThreeResults, turnResult };
}

/**
 * The drawer ran out of time (or disconnected) while picking a target.
 * Picks a random opponent; falls back to the drawer if nobody else is active.
 */
export type AutoActionOutcome =
  | { kind: 'resolved'; result: ActionResult }
  | { kind: 'fizzled'; turnResult: TurnOutcome };

export function autoResolveAction(roomCode: string): AutoActionOutcome | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || !state.pendingAction) return null;

  const { drawerId, eligibleTargets } = state.pendingAction;
  const valid = eligibleTargets.filter(id => state.playerData[id]?.roundStatus === 'active');
  const opponents = valid.filter(id => id !== drawerId);
  const pool = opponents.length > 0 ? opponents : valid;

  if (pool.length > 0) {
    const targetId = pool[Math.floor(Math.random() * pool.length)];
    const result = resolveAction(roomCode, drawerId, targetId);
    if (result) return { kind: 'resolved', result };
  }

  // Nobody can be targeted. The card is discarded with no effect.
  state.pendingAction = null;
  return { kind: 'fizzled', turnResult: advanceTurn(state) };
}

// ---- Public API: Chaos Mode ----

export function chaosSubmit(roomCode: string, playerId: string, choice: 'hit' | 'stay'): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || state.settings.mode !== 'chaos') return false;
  if (state.flipSevenAchievedBy) return false;
  if (choice !== 'hit' && choice !== 'stay') return false;

  const pd = state.playerData[playerId];
  if (!pd || pd.roundStatus !== 'active') return false;

  if (!state.chaosChoices) state.chaosChoices = {};
  if (state.chaosChoices[playerId]) return false; // locked in
  state.chaosChoices[playerId] = choice;
  return true;
}

/** True when every active player has locked in a choice for this tick. */
export function allChaosChoicesIn(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || state.settings.mode !== 'chaos') return false;
  const active = getActivePlayers(state);
  return active.length > 0 && active.every(id => state.chaosChoices?.[id] !== undefined);
}

/** Lock in 'stay' for every active player who hasn't chosen. Returns who was auto-stayed. */
export function forceChaosStays(roomCode: string): string[] {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || state.settings.mode !== 'chaos') return [];
  if (!state.chaosChoices) state.chaosChoices = {};
  const forced: string[] = [];
  for (const id of getActivePlayers(state)) {
    if (!state.chaosChoices[id]) {
      state.chaosChoices[id] = 'stay';
      forced.push(id);
    }
  }
  return forced;
}

export interface ChaosResult {
  results: {
    playerId: string;
    choice: 'hit' | 'stay';
    card?: Card;
    result?: FlipResult;
    flipSeven?: boolean;
  }[];
  turnResult: TurnOutcome;
}

/** Resolve every locked-in choice at once, in seating order. */
export function resolveChaos(roomCode: string): ChaosResult | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || state.settings.mode !== 'chaos') return null;

  const choices = state.chaosChoices ?? {};
  const results: ChaosResult['results'] = [];

  for (const playerId of state.turnOrder) {
    const pd = state.playerData[playerId];
    if (!pd || pd.roundStatus !== 'active') continue;

    const choice = choices[playerId] ?? 'stay';
    if (choice === 'stay') {
      pd.roundStatus = 'stayed';
      results.push({ playerId, choice: 'stay' });
      continue;
    }
    const card = drawCard(state);
    const resolved = resolveCardForPlayer(state, playerId, card);
    results.push({ playerId, choice: 'hit', card, ...resolved });
  }

  state.chaosChoices = {};
  const roundOver = state.flipSevenAchievedBy !== null || getActivePlayers(state).length === 0;
  return { results, turnResult: roundOver ? 'roundEnd' : 'continue' };
}

// ---- Public API: endRound (calculate scores, check win) ----

export function endRound(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing') return false;

  state.pendingAction = null;
  state.chaosChoices = state.settings.mode === 'chaos' ? {} : null;
  state.turnTimerEnd = null;

  const scores: Omit<Flip7RoundScore, 'playerName'>[] = [];
  for (const playerId of state.turnOrder) {
    if (state.departed.includes(playerId)) continue;
    const pd = state.playerData[playerId];
    const busted = pd.roundStatus === 'busted';
    const roundScore = computeRoundScore(pd.numberCards.map(c => c.value), pd.modifiers, busted);
    state.cumulativeScores[playerId] = (state.cumulativeScores[playerId] ?? 0) + roundScore;
    scores.push({
      playerId,
      roundScore,
      cumulativeScore: state.cumulativeScores[playerId],
      busted,
      flipSeven: !busted && pd.numberCards.length >= FLIP_7_CARD_COUNT,
    });
  }

  state.roundHistory.push({
    round: state.round,
    scores: scores.map(({ playerId, roundScore, busted, flipSeven }) => ({ playerId, roundScore, busted, flipSeven })),
  });

  // Win: highest score at or above the target. A tie at the top keeps the game going.
  const qualifiers = scores
    .filter(s => s.cumulativeScore >= state.settings.targetScore)
    .sort((a, b) => b.cumulativeScore - a.cumulativeScore);
  let winnerId: string | null = null;
  if (qualifiers.length === 1 || (qualifiers.length > 1 && qualifiers[0].cumulativeScore > qualifiers[1].cumulativeScore)) {
    winnerId = qualifiers[0].playerId;
  }

  state.lastRoundScores = scores;
  state.lastWinnerId = winnerId;
  state.phase = winnerId ? 'finished' : 'roundEnd';
  return true;
}

// ---- Public API: nextRound ----

export function nextRound(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'roundEnd') return false;

  // Everything on the table goes to the discard pile (bust cards are already there)
  for (const playerId of state.turnOrder) {
    const pd = state.playerData[playerId];
    state.discardPile.push(...pd.numberCards);
    for (const kind of pd.modifiers) state.discardPile.push({ type: 'modifier', kind });
    for (let i = 0; i < pd.secondChances; i++) state.discardPile.push({ type: 'action', kind: 'secondChance' });
    pd.numberCards = [];
    pd.modifiers = [];
    pd.secondChances = 0;
    pd.roundStatus = 'active';
    pd.bustCard = null;
  }

  state.dealerIndex = (state.dealerIndex + 1) % state.turnOrder.length;
  state.round++;
  state.flipSevenAchievedBy = null;
  state.activityLog = [];
  state.chaosChoices = state.settings.mode === 'chaos' ? {} : null;
  state.lastRoundScores = null;
  state.lastWinnerId = null;
  state.pendingAction = null;
  state.turnTimerEnd = null;

  // Fresh deck when running low, so a round never starts on a near-empty pile
  if (state.deck.length < state.turnOrder.length + 10) {
    state.deck = buildDeck(state.settings.mode);
    state.discardPile = [];
  }

  state.phase = 'dealing';
  return true;
}

// ---- Public API: rematch ----

export function rematch(roomCode: string, room: Room, settings?: Partial<Flip7Settings>): Flip7ServerState {
  games.delete(roomCode);
  clearRoomTimer(roomCode);
  return createGame(room, settings);
}

// ---- Public API: getClientState ----

export function getClientState(roomCode: string, playerId: string, room: Room): Flip7ClientState | null {
  const state = games.get(roomCode);
  if (!state) return null;

  const myData = state.playerData[playerId];
  const present = state.turnOrder.filter(id => !state.departed.includes(id));

  const players: Flip7PlayerInfo[] = present.map(id => {
    const pd = state.playerData[id];
    const player = room.players[id];
    return {
      id,
      name: player?.name || 'Unknown',
      avatar: player?.avatar || '😎',
      connected: player?.connected ?? false,
      roundStatus: pd.roundStatus,
      cardCount: pd.numberCards.length,
      visibleCards: pd.numberCards.map(c => c.value),
      bustCard: pd.bustCard ? pd.bustCard.value : null,
      hasSecondChance: pd.secondChances > 0,
      modifiers: [...pd.modifiers],
      cumulativeScore: state.cumulativeScores[id] || 0,
    };
  });

  const playing = state.phase === 'playing';
  const currentPlayerId = playing && state.settings.mode === 'classic'
    ? state.turnOrder[state.currentPlayerIndex] ?? null
    : null;
  const showScores = state.phase === 'roundEnd' || state.phase === 'finished';

  return {
    phase: state.phase,
    players,
    myCards: myData ? [...myData.numberCards] : [],
    myModifiers: myData ? [...myData.modifiers] : [],
    mySecondChances: myData?.secondChances ?? 0,
    myRoundStatus: myData?.roundStatus ?? 'stayed',
    myBustChance: playing && myData ? bustChance(state, myData) : null,
    activePlayerId: currentPlayerId,
    isMyTurn: currentPlayerId === playerId && !state.flipSevenAchievedBy,
    deckRemaining: state.deck.length,
    round: state.round,
    settings: state.settings,
    pendingAction: state.pendingAction
      ? { ...state.pendingAction, eligibleTargets: [...state.pendingAction.eligibleTargets] }
      : null,
    chaosSubmitted: state.chaosChoices ? Object.keys(state.chaosChoices) : [],
    roundScores: showScores && state.lastRoundScores
      ? state.lastRoundScores
          .filter(s => present.includes(s.playerId))
          .map(s => ({ ...s, playerName: room.players[s.playerId]?.name || 'Unknown' }))
      : null,
    roundHistory: state.roundHistory,
    winnerId: state.lastWinnerId,
    activityLog: state.activityLog.slice(-20),
    flipSevenAchievedBy: state.flipSevenAchievedBy,
  };
}

// ---- Public API: swapPlayerId ----

export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = games.get(roomCode);
  if (!state) return;
  const swap = (id: string) => (id === oldId ? newId : id);

  if (state.playerData[oldId]) {
    state.playerData[newId] = state.playerData[oldId];
    delete state.playerData[oldId];
  }
  state.turnOrder = state.turnOrder.map(swap);
  state.departed = state.departed.map(swap);

  if (state.cumulativeScores[oldId] !== undefined) {
    state.cumulativeScores[newId] = state.cumulativeScores[oldId];
    delete state.cumulativeScores[oldId];
  }

  if (state.pendingAction) {
    state.pendingAction.drawerId = swap(state.pendingAction.drawerId);
    state.pendingAction.eligibleTargets = state.pendingAction.eligibleTargets.map(swap);
  }

  if (state.chaosChoices && state.chaosChoices[oldId] !== undefined) {
    state.chaosChoices[newId] = state.chaosChoices[oldId];
    delete state.chaosChoices[oldId];
  }

  if (state.flipSevenAchievedBy === oldId) state.flipSevenAchievedBy = newId;
  if (state.lastWinnerId === oldId) state.lastWinnerId = newId;

  for (const entry of state.activityLog) entry.playerId = swap(entry.playerId);
  if (state.lastRoundScores) {
    for (const s of state.lastRoundScores) s.playerId = swap(s.playerId);
  }
  for (const round of state.roundHistory) {
    for (const s of round.scores) s.playerId = swap(s.playerId);
  }

  console.log(`[Flip7] Swapped player ID ${oldId} → ${newId} in room ${roomCode}`);
}

// ---- Public API: departures ----

/**
 * A player left the room for good (explicit leave or zombie cleanup). They sit
 * out the rest of the game. Returns how the turn flow changed: 'none' when
 * nothing else needs to happen, or null when there's no game / unknown player.
 */
export function markDeparted(roomCode: string, playerId: string): 'none' | TurnOutcome | null {
  const state = games.get(roomCode);
  if (!state || !state.playerData[playerId]) return null;
  if (!state.departed.includes(playerId)) state.departed.push(playerId);
  if (state.phase !== 'playing') return 'none';

  const pd = state.playerData[playerId];
  const wasCurrent = state.settings.mode === 'classic' && state.turnOrder[state.currentPlayerIndex] === playerId;

  if (state.pendingAction) {
    if (state.pendingAction.drawerId === playerId) {
      state.pendingAction = null; // their action card fizzles
    } else {
      state.pendingAction.eligibleTargets = state.pendingAction.eligibleTargets.filter(id => id !== playerId);
    }
  }
  if (state.chaosChoices) delete state.chaosChoices[playerId];

  if (pd.roundStatus !== 'active') return 'none';
  pd.roundStatus = 'stayed';

  if (state.flipSevenAchievedBy) return 'none'; // round already ending
  const anyActive = getActivePlayers(state).length > 0;
  if (state.settings.mode === 'chaos') return anyActive ? 'continue' : 'roundEnd';
  if (wasCurrent) return advanceTurn(state);
  return anyActive ? 'none' : 'roundEnd';
}

// ---- Public API: who is the game waiting on? ----

/** True if play is blocked waiting for this player's input right now. */
export function isAwaitingPlayer(roomCode: string, playerId: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || state.flipSevenAchievedBy) return false;
  if (state.pendingAction) return state.pendingAction.drawerId === playerId;

  const pd = state.playerData[playerId];
  if (!pd || pd.roundStatus !== 'active') return false;
  if (state.settings.mode === 'classic') return state.turnOrder[state.currentPlayerIndex] === playerId;
  return !state.chaosChoices?.[playerId];
}

export function getAwaitedPlayers(roomCode: string): string[] {
  const state = games.get(roomCode);
  if (!state) return [];
  return state.turnOrder.filter(id => isAwaitingPlayer(roomCode, id));
}

export function getCurrentPlayerId(roomCode: string): string | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || state.settings.mode !== 'classic') return null;
  return state.turnOrder[state.currentPlayerIndex] || null;
}

// ---- Public API: getGameState ----

export function getGameState(roomCode: string): Flip7ServerState | undefined {
  return games.get(roomCode);
}

// ---- Public API: endGame ----

export function endGame(roomCode: string): void {
  games.delete(roomCode);
  clearRoomTimer(roomCode);
  console.log(`[Flip7] Game ended and state deleted for room ${roomCode}`);
}

// ---- Public API: addActivityLog ----

export function addActivityLog(roomCode: string, entry: ActivityLogEntry): void {
  const state = games.get(roomCode);
  if (!state) return;
  state.activityLog.push(entry);
  if (state.activityLog.length > 50) {
    state.activityLog = state.activityLog.slice(-50);
  }
}

// ---- Timer Management ----

export function setRoomTimer(roomCode: string, timer: ReturnType<typeof setInterval>): void {
  clearRoomTimer(roomCode);
  activeTimers.set(roomCode, timer);
}

export function clearRoomTimer(roomCode: string): void {
  const existing = activeTimers.get(roomCode);
  if (existing) {
    clearInterval(existing);
    activeTimers.delete(roomCode);
  }
}
