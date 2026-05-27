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
  type Card,
  type NumberCard,
  type ActionCard,
  type ModifierCard,
  type ModifierCardKind,
  type PendingAction,
  type PendingModifier,
  type ActivityLogEntry,
  type PlayerRoundStatus,
  DEFAULT_FLIP7_SETTINGS,
  DECK_COMPOSITION,
  FLIP_7_BONUS,
  FLIP_7_CARD_COUNT,
  DISCONNECT_GRACE_MS,
  ACTION_TIMEOUT_MS,
} from '@/types/games/flip7';

// ---- Module-scoped state ----

const games = new Map<string, Flip7ServerState>();
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

// ---- Helper: get eligible targets for actions ----

function getEligibleTargets(state: Flip7ServerState, drawerId: string): string[] {
  // All active players are eligible targets (including the drawer themselves)
  return state.turnOrder.filter(id => {
    const pd = state.playerData[id];
    return pd.roundStatus === 'active';
  });
}

// ---- Helper: advance turn to next active player ----

function advanceTurn(state: Flip7ServerState): 'continue' | 'roundEnd' {
  // Clear pending states
  state.pendingAction = null;
  state.pendingModifier = null;

  // Check if Flip 7 was achieved
  if (state.flipSevenAchievedBy) return 'roundEnd';

  // Check if any active players remain
  const activePlayers = state.turnOrder.filter(id =>
    state.playerData[id].roundStatus === 'active'
  );

  if (activePlayers.length === 0) return 'roundEnd';

  // Advance to next active player (clockwise)
  let attempts = 0;
  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.turnOrder.length;
    attempts++;
    if (state.playerData[state.turnOrder[state.currentPlayerIndex]].roundStatus === 'active') {
      return 'continue';
    }
  } while (attempts < state.turnOrder.length);

  // Should never reach here if activePlayers.length > 0, but safety fallback
  return 'roundEnd';
}

// ---- Helper: calculate round score ----

function calculateRoundScore(playerData: Flip7ServerPlayerData, isFlip7: boolean): number {
  if (playerData.roundStatus === 'busted') return 0;

  // 1. Sum number card values
  let base = playerData.numberCards.reduce((sum, card) => sum + card.value, 0);

  // 2. Apply multiplicative modifiers FIRST (each ×2 doubles the number card sum)
  const times2Count = playerData.modifiers.filter(m => m === 'times2').length;
  base *= Math.pow(2, times2Count);

  // 3. THEN add additive modifiers (not multiplied)
  for (const mod of playerData.modifiers) {
    if (mod === 'plus2') base += 2;
    if (mod === 'plus4') base += 4;
  }

  // 4. THEN add Flip 7 bonus (not multiplied)
  if (isFlip7) base += FLIP_7_BONUS;

  return base;
}

// ---- Helper: draw a card from deck (replenish if empty) ----

function drawCard(state: Flip7ServerState): Card {
  if (state.deck.length === 0) {
    // Rebuild deck from discard pile
    state.deck = [...state.discardPile];
    state.discardPile = [];
    shuffleArray(state.deck);
    console.log(`[Flip7] Deck exhausted, reshuffled ${state.deck.length} cards from discard`);
  }
  return state.deck.pop()!;
}

// ---- Helper: check if player has duplicate number ----

function hasDuplicateNumber(playerData: Flip7ServerPlayerData, value: number): boolean {
  return playerData.numberCards.some(c => c.value === value);
}

// ---- Public API: createGame ----

export function createGame(room: Room, settings?: Partial<Flip7Settings>): Flip7ServerState {
  const mergedSettings: Flip7Settings = { ...DEFAULT_FLIP7_SETTINGS, ...settings };

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

  const deck = buildDeck(mergedSettings.mode);

  const state: Flip7ServerState = {
    phase: 'dealing',
    deck,
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
    pendingModifier: null,
    activityLog: [],
    flipSevenAchievedBy: null,
    chaosChoices: null,
    lastRoundScores: null,
    lastWinnerId: null,
  };

  games.set(room.code, state);
  console.log(`[Flip7] Game created in ${room.code} with ${playerIds.length} players, mode: ${mergedSettings.mode}`);
  return state;
}

// ---- Public API: dealInitialCards ----
// Called after createGame to deal one card to each player.
// Returns array of deal events for broadcasting.

export interface DealEvent {
  playerId: string;
  playerName: string;
  card: Card;
  resolved?: 'freeze' | 'flipThree' | 'secondChance' | 'modifier';
  freezeTargetId?: string;
  flipThreeResults?: { card: Card; result: 'safe' | 'bust' | 'secondChance' }[];
}

export function dealInitialCards(roomCode: string, room: Room): DealEvent[] {
  const state = games.get(roomCode);
  if (!state) return [];

  const events: DealEvent[] = [];
  const dealOrder = getDealOrder(state);

  for (const playerId of dealOrder) {
    const pd = state.playerData[playerId];
    if (!pd || pd.roundStatus !== 'active') continue;

    // Draw cards until we get a non-disruptive one (skip Freeze/FlipThree during deal)
    let card = drawCard(state);
    while (card.type === 'action' && (card.kind === 'freeze' || card.kind === 'flipThree')) {
      // Put disruptive action cards back into the deck and reshuffle
      state.deck.push(card);
      shuffleArray(state.deck);
      card = drawCard(state);
    }

    const playerName = room.players[playerId]?.name || 'Unknown';
    const event: DealEvent = { playerId, playerName, card };

    if (card.type === 'number') {
      pd.numberCards.push(card);
    } else if (card.type === 'modifier') {
      pd.modifiers.push(card.kind);
      event.resolved = 'modifier';
    } else if (card.type === 'action' && card.kind === 'secondChance') {
      pd.secondChances++;
      event.resolved = 'secondChance';
    }

    events.push(event);
  }

  // Set phase to playing and set first turn
  state.phase = 'playing';
  // First turn goes to player left of dealer
  state.currentPlayerIndex = (state.dealerIndex + 1) % state.turnOrder.length;
  // Skip to first active player
  let attempts = 0;
  while (
    state.playerData[state.turnOrder[state.currentPlayerIndex]]?.roundStatus !== 'active' &&
    attempts < state.turnOrder.length
  ) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.turnOrder.length;
    attempts++;
  }

  return events;
}

// ---- Helper: resolve a card for a player (used during deal and flipThree) ----

function resolveCardForPlayer(
  state: Flip7ServerState,
  playerId: string,
  card: Card
): 'safe' | 'bust' | 'secondChance' {
  const pd = state.playerData[playerId];

  if (card.type === 'number') {
    if (hasDuplicateNumber(pd, card.value)) {
      // Check for Second Chance
      if (pd.secondChances > 0) {
        pd.secondChances--;
        state.discardPile.push(card);
        return 'secondChance';
      }
      pd.roundStatus = 'busted';
      pd.bustCard = card as NumberCard;
      state.discardPile.push(card);
      return 'bust';
    }
    pd.numberCards.push(card);
    // Check Flip 7
    if (pd.numberCards.length >= FLIP_7_CARD_COUNT) {
      state.flipSevenAchievedBy = playerId;
    }
    return 'safe';
  } else if (card.type === 'modifier') {
    pd.modifiers.push(card.kind);
    return 'safe';
  } else if (card.type === 'action') {
    if (card.kind === 'secondChance') {
      pd.secondChances++;
    }
    // Freeze and FlipThree during flipThree resolution are discarded
    // (they don't chain — simplified for digital version)
    state.discardPile.push(card);
    return 'safe';
  }

  return 'safe';
}

// ---- Helper: get deal order (clockwise from left of dealer) ----

function getDealOrder(state: Flip7ServerState): string[] {
  const order: string[] = [];
  const len = state.turnOrder.length;
  for (let i = 1; i <= len; i++) {
    order.push(state.turnOrder[(state.dealerIndex + i) % len]);
  }
  return order;
}

// ---- Public API: hit ----

export interface HitResult {
  card: Card;
  result: 'safe' | 'bust' | 'secondChance';
  flipSeven: boolean;
  turnResult: 'continue' | 'roundEnd';
  pendingAction?: PendingAction;
  pendingModifier?: PendingModifier;
}

export function hit(roomCode: string, playerId: string): HitResult | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing') return null;

  // Block all actions if Flip 7 was achieved (round is ending)
  if (state.flipSevenAchievedBy) return null;

  // Validate it's this player's turn (classic mode)
  if (state.settings.mode === 'classic') {
    const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
    if (currentPlayerId !== playerId) return null;
  }

  const pd = state.playerData[playerId];
  if (!pd || pd.roundStatus !== 'active') return null;

  const card = drawCard(state);

  if (card.type === 'number') {
    if (hasDuplicateNumber(pd, card.value)) {
      // Check Second Chance
      if (pd.secondChances > 0) {
        pd.secondChances--;
        state.discardPile.push(card);
        // Second Chance saves you but your draw is used — advance turn
        const turnResult = state.settings.mode === 'classic' ? advanceTurn(state) : 'continue' as const;
        return { card, result: 'secondChance', flipSeven: false, turnResult };
      }
      // Bust
      pd.roundStatus = 'busted';
      pd.bustCard = card as NumberCard;
      state.discardPile.push(card);
      const turnResult = state.settings.mode === 'classic' ? advanceTurn(state) : 'continue';
      return { card, result: 'bust', flipSeven: false, turnResult };
    }
    // Safe — add to tableau
    pd.numberCards.push(card);
    const flipSeven = pd.numberCards.length >= FLIP_7_CARD_COUNT;
    if (flipSeven) {
      state.flipSevenAchievedBy = playerId;
    }
    // In classic mode: 1 card per turn, then advance to next player
    const turnResult = flipSeven
      ? 'roundEnd' as const
      : (state.settings.mode === 'classic' ? advanceTurn(state) : 'continue' as const);
    return { card, result: 'safe', flipSeven, turnResult };
  }

  if (card.type === 'action') {
    state.discardPile.push(card);
    if (card.kind === 'secondChance') {
      pd.secondChances++;
      // Drawing Second Chance counts as your card — advance turn
      const turnResult = state.settings.mode === 'classic' ? advanceTurn(state) : 'continue' as const;
      return { card, result: 'safe', flipSeven: false, turnResult };
    }
    // Freeze or FlipThree — set pending action
    const eligible = getEligibleTargets(state, playerId);
    if (eligible.length === 0) {
      // No valid targets, discard with no effect — advance turn (card was still your draw)
      const turnResult = state.settings.mode === 'classic' ? advanceTurn(state) : 'continue' as const;
      return { card, result: 'safe', flipSeven: false, turnResult };
    }
    const pending: PendingAction = {
      cardKind: card.kind as 'freeze' | 'flipThree',
      drawerId: playerId,
      eligibleTargets: eligible,
    };
    state.pendingAction = pending;
    return { card, result: 'safe', flipSeven: false, turnResult: 'continue', pendingAction: pending };
  }

  if (card.type === 'modifier') {
    // All modifiers are positive — auto-keep, then advance turn (1 card per turn)
    pd.modifiers.push(card.kind);
    const turnResult = state.settings.mode === 'classic' ? advanceTurn(state) : 'continue' as const;
    return { card, result: 'safe', flipSeven: false, turnResult };
  }

  return { card, result: 'safe', flipSeven: false, turnResult: 'continue' };
}

// ---- Public API: stay ----

export function stay(roomCode: string, playerId: string): 'continue' | 'roundEnd' | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing') return null;

  // Block all actions if Flip 7 was achieved (round is ending)
  if (state.flipSevenAchievedBy) return null;

  // Validate turn (classic mode)
  if (state.settings.mode === 'classic') {
    const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
    if (currentPlayerId !== playerId) return null;
  }

  const pd = state.playerData[playerId];
  if (!pd || pd.roundStatus !== 'active') return null;

  pd.roundStatus = 'stayed';
  return advanceTurn(state);
}

// ---- Public API: useAction (resolve Freeze or FlipThree) ----

export interface ActionResult {
  type: 'freeze' | 'flipThree';
  targetId: string;
  flipThreeResults?: { card: Card; result: 'safe' | 'bust' | 'secondChance' }[];
  turnResult: 'continue' | 'roundEnd';
}

export function useAction(roomCode: string, playerId: string, targetId: string): ActionResult | null {
  const state = games.get(roomCode);
  if (!state || !state.pendingAction) return null;
  if (state.pendingAction.drawerId !== playerId) return null;
  if (!state.pendingAction.eligibleTargets.includes(targetId)) return null;

  const actionKind = state.pendingAction.cardKind;
  state.pendingAction = null;

  if (actionKind === 'freeze') {
    const targetPd = state.playerData[targetId];
    if (targetPd) {
      targetPd.roundStatus = 'frozen';
    }
    // After resolving action, advance turn to next player
    const activePlayers = state.turnOrder.filter(id =>
      state.playerData[id].roundStatus === 'active'
    );
    if (activePlayers.length === 0) return { type: 'freeze', targetId, turnResult: 'roundEnd' };
    const turnResult = advanceTurn(state);
    return { type: 'freeze', targetId, turnResult };
  }

  if (actionKind === 'flipThree') {
    const targetPd = state.playerData[targetId];
    const results: { card: Card; result: 'safe' | 'bust' | 'secondChance' }[] = [];

    if (targetPd) {
      for (let i = 0; i < 3; i++) {
        if (targetPd.roundStatus === 'busted') break;
        if (targetPd.numberCards.length >= FLIP_7_CARD_COUNT) break;
        const card = drawCard(state);
        const result = resolveCardForPlayer(state, targetId, card);
        results.push({ card, result });
      }
    }

    const flipSeven = state.flipSevenAchievedBy !== null;
    // After resolving action, advance turn to next player (unless round ends)
    const turnResult = flipSeven ? 'roundEnd' as const : advanceTurn(state);
    return { type: 'flipThree', targetId, flipThreeResults: results, turnResult };
  }

  return null;
}

// ---- Public API: giveModifier ----

export function giveModifier(roomCode: string, playerId: string, targetId: string | null): 'continue' | 'roundEnd' | null {
  const state = games.get(roomCode);
  if (!state || !state.pendingModifier) return null;
  if (state.pendingModifier.drawerId !== playerId) return null;

  const modKind = state.pendingModifier.cardKind;
  state.pendingModifier = null;

  if (targetId && targetId !== playerId) {
    // Transfer: remove from drawer, add to target
    const drawerPd = state.playerData[playerId];
    const targetPd = state.playerData[targetId];
    if (drawerPd && targetPd) {
      const idx = drawerPd.modifiers.lastIndexOf(modKind);
      if (idx !== -1) {
        drawerPd.modifiers.splice(idx, 1);
        targetPd.modifiers.push(modKind);
      }
    }
  }
  // If targetId is null or same as playerId, keep it (already added in hit())

  // Modifier choice does NOT end the turn — player continues hitting or staying
  return 'continue';
}

// ---- Public API: chaosSubmit ----

export function chaosSubmit(roomCode: string, playerId: string, choice: 'hit' | 'stay'): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing' || state.settings.mode !== 'chaos') return false;

  const pd = state.playerData[playerId];
  if (!pd || pd.roundStatus !== 'active') return false;

  if (!state.chaosChoices) state.chaosChoices = {};
  state.chaosChoices[playerId] = choice;
  return true;
}

// Check if all active players have submitted chaos choices
export function allChaosChoicesIn(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || !state.chaosChoices) return false;

  const activePlayers = state.turnOrder.filter(id =>
    state.playerData[id].roundStatus === 'active'
  );
  return activePlayers.every(id => state.chaosChoices![id] !== undefined);
}

// Resolve all chaos choices simultaneously
export interface ChaosResult {
  results: { playerId: string; choice: 'hit' | 'stay'; card?: Card; result?: 'safe' | 'bust' | 'secondChance'; flipSeven?: boolean }[];
  roundEnd: boolean;
}

export function resolveChaos(roomCode: string): ChaosResult | null {
  const state = games.get(roomCode);
  if (!state || !state.chaosChoices) return null;

  const results: ChaosResult['results'] = [];
  let roundEnd = false;

  // Process in turn order
  for (const playerId of state.turnOrder) {
    const pd = state.playerData[playerId];
    if (pd.roundStatus !== 'active') continue;

    const choice = state.chaosChoices[playerId] || 'stay';

    if (choice === 'stay') {
      pd.roundStatus = 'stayed';
      results.push({ playerId, choice: 'stay' });
    } else {
      const card = drawCard(state);
      const result = resolveCardForPlayer(state, playerId, card);
      const flipSeven = state.flipSevenAchievedBy === playerId;
      results.push({ playerId, choice: 'hit', card, result, flipSeven });
      if (flipSeven) roundEnd = true;
    }
  }

  // Check if round should end (all stayed/busted or flip7)
  const activePlayers = state.turnOrder.filter(id =>
    state.playerData[id].roundStatus === 'active'
  );
  if (activePlayers.length === 0 || state.flipSevenAchievedBy) {
    roundEnd = true;
  }

  // Clear chaos choices for next tick
  state.chaosChoices = {};

  return { results, roundEnd };
}

// ---- Public API: endRound (calculate scores, check win) ----

export interface RoundEndResult {
  scores: { playerId: string; roundScore: number; cumulativeScore: number; busted: boolean }[];
  winnerId: string | null;
  flipSevenBy: string | null;
}

export function endRound(roomCode: string): RoundEndResult | null {
  const state = games.get(roomCode);
  if (!state) return null;

  state.phase = 'roundEnd';
  const scores: RoundEndResult['scores'] = [];

  for (const playerId of state.turnOrder) {
    const pd = state.playerData[playerId];
    const isFlip7 = state.flipSevenAchievedBy === playerId;
    const roundScore = calculateRoundScore(pd, isFlip7);
    state.cumulativeScores[playerId] = (state.cumulativeScores[playerId] || 0) + roundScore;

    scores.push({
      playerId,
      roundScore,
      cumulativeScore: state.cumulativeScores[playerId],
      busted: pd.roundStatus === 'busted',
    });
  }

  // Check win condition
  let winnerId: string | null = null;
  const targetScore = state.settings.targetScore;
  const qualifiers = scores.filter(s => s.cumulativeScore >= targetScore);

  if (qualifiers.length === 1) {
    winnerId = qualifiers[0].playerId;
  } else if (qualifiers.length > 1) {
    // Multiple players over target — check if one is clearly ahead
    qualifiers.sort((a, b) => b.cumulativeScore - a.cumulativeScore);
    if (qualifiers[0].cumulativeScore > qualifiers[1].cumulativeScore) {
      // One player has the highest score — they win
      winnerId = qualifiers[0].playerId;
    } else {
      // Tied at the top — per official rules, keep playing until one player is ahead
      // Don't declare a winner, game continues with more rounds
      winnerId = null;
    }
  }

  if (winnerId) {
    state.phase = 'finished';
  }

  // Store for getClientState
  state.lastRoundScores = scores;
  state.lastWinnerId = winnerId;

  return { scores, winnerId, flipSevenBy: state.flipSevenAchievedBy };
}

// ---- Public API: nextRound ----

export function nextRound(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'roundEnd') return false;

  // Discard all cards in play
  for (const playerId of state.turnOrder) {
    const pd = state.playerData[playerId];
    for (const card of pd.numberCards) {
      state.discardPile.push(card);
    }
    // Modifiers and second chances are conceptual, not physical cards to discard
    pd.numberCards = [];
    pd.modifiers = [];
    pd.secondChances = 0;
    pd.roundStatus = 'active';
    pd.bustCard = null;
  }

  // Rotate dealer
  state.dealerIndex = (state.dealerIndex + 1) % state.turnOrder.length;
  state.round++;
  state.flipSevenAchievedBy = null;
  state.activityLog = [];
  state.chaosChoices = state.settings.mode === 'chaos' ? {} : null;
  state.lastRoundScores = null;
  state.lastWinnerId = null;
  state.pendingAction = null;
  state.pendingModifier = null;
  state.turnTimerEnd = null;

  // Rebuild deck if empty
  if (state.deck.length < state.turnOrder.length + 10) {
    state.deck = buildDeck(state.settings.mode);
    state.discardPile = [];
  }

  state.phase = 'dealing';
  return true;
}

// ---- Public API: rematch ----

export function rematch(roomCode: string, room: Room, settings?: Partial<Flip7Settings>): Flip7ServerState {
  // Delete old state and create fresh game with provided settings
  games.delete(roomCode);
  clearRoomTimer(roomCode);
  return createGame(room, settings);
}

// ---- Public API: getClientState ----

export function getClientState(roomCode: string, playerId: string, room: Room): Flip7ClientState | null {
  const state = games.get(roomCode);
  if (!state) return null;

  const myData = state.playerData[playerId];

  const players: Flip7PlayerInfo[] = state.turnOrder.map(id => {
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
      roundScore: 0, // populated at roundEnd
    };
  });

  const currentPlayerId = state.turnOrder[state.currentPlayerIndex] || null;

  return {
    phase: state.phase,
    players,
    myCards: myData ? [...myData.numberCards] : [],
    myModifiers: myData ? [...myData.modifiers] : [],
    mySecondChances: myData?.secondChances ?? 0,
    myRoundStatus: myData?.roundStatus ?? 'active',
    activePlayerId: state.settings.mode === 'classic' ? currentPlayerId : null,
    isMyTurn: state.settings.mode === 'classic' && currentPlayerId === playerId,
    deckRemaining: state.deck.length,
    round: state.round,
    dealerIndex: state.dealerIndex,
    settings: state.settings,
    pendingAction: state.pendingAction?.drawerId === playerId ? state.pendingAction : null,
    pendingModifier: state.pendingModifier?.drawerId === playerId ? state.pendingModifier : null,
    lastFlip: null, // set by socket handler on broadcast
    roundScores: (state.phase === 'roundEnd' || state.phase === 'finished') && state.lastRoundScores
      ? state.lastRoundScores.map(s => ({
          ...s,
          playerName: room.players[s.playerId]?.name || 'Unknown',
        }))
      : null,
    winnerId: state.lastWinnerId || null,
    activityLog: state.activityLog.slice(-20),
    flipSevenAchievedBy: state.flipSevenAchievedBy,
  };
}

// ---- Public API: swapPlayerId ----

export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = games.get(roomCode);
  if (!state) return;

  // Swap in playerData
  if (state.playerData[oldId]) {
    state.playerData[newId] = state.playerData[oldId];
    delete state.playerData[oldId];
  }

  // Swap in turnOrder
  const turnIdx = state.turnOrder.indexOf(oldId);
  if (turnIdx !== -1) {
    state.turnOrder[turnIdx] = newId;
  }

  // Swap in cumulativeScores
  if (state.cumulativeScores[oldId] !== undefined) {
    state.cumulativeScores[newId] = state.cumulativeScores[oldId];
    delete state.cumulativeScores[oldId];
  }

  // Swap in pendingAction
  if (state.pendingAction) {
    if (state.pendingAction.drawerId === oldId) {
      state.pendingAction.drawerId = newId;
    }
    state.pendingAction.eligibleTargets = state.pendingAction.eligibleTargets.map(
      id => id === oldId ? newId : id
    );
  }

  // Swap in pendingModifier
  if (state.pendingModifier) {
    if (state.pendingModifier.drawerId === oldId) {
      state.pendingModifier.drawerId = newId;
    }
    state.pendingModifier.eligibleTargets = state.pendingModifier.eligibleTargets.map(
      id => id === oldId ? newId : id
    );
  }

  // Swap in chaosChoices
  if (state.chaosChoices && state.chaosChoices[oldId] !== undefined) {
    state.chaosChoices[newId] = state.chaosChoices[oldId];
    delete state.chaosChoices[oldId];
  }

  // Swap in flipSevenAchievedBy
  if (state.flipSevenAchievedBy === oldId) {
    state.flipSevenAchievedBy = newId;
  }

  // Swap in activityLog
  for (const entry of state.activityLog) {
    if (entry.playerId === oldId) {
      entry.playerId = newId;
    }
  }

  console.log(`[Flip7] Swapped player ID ${oldId} → ${newId} in room ${roomCode}`);
}

// ---- Public API: handleDisconnectedTurn ----

export function handleDisconnectedTurn(roomCode: string): 'continue' | 'roundEnd' | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing') return null;

  const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
  const pd = state.playerData[currentPlayerId];
  if (!pd || pd.roundStatus !== 'active') return null;

  // If player has no cards, skip their turn
  if (pd.numberCards.length === 0 && pd.modifiers.length === 0 && pd.secondChances === 0) {
    return advanceTurn(state);
  }

  // Auto-stay
  pd.roundStatus = 'stayed';
  return advanceTurn(state);
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
  // Keep last 50 entries
  if (state.activityLog.length > 50) {
    state.activityLog = state.activityLog.slice(-50);
  }
}

// ---- Public API: getCurrentPlayerId ----

export function getCurrentPlayerId(roomCode: string): string | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'playing') return null;
  return state.turnOrder[state.currentPlayerIndex] || null;
}

// ---- Timer Management ----

export function setRoomTimer(roomCode: string, timer: ReturnType<typeof setTimeout>): void {
  clearRoomTimer(roomCode);
  activeTimers.set(roomCode, timer);
}

export function clearRoomTimer(roomCode: string): void {
  const existing = activeTimers.get(roomCode);
  if (existing) {
    clearInterval(existing);
    clearTimeout(existing);
    activeTimers.delete(roomCode);
  }
}
