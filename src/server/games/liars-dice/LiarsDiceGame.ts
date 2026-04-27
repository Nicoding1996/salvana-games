import type { Room } from '@/types/hub';
import type {
  LiarsDiceServerState,
  LiarsDiceClientState,
  LiarsDiceSettings,
  LiarsDicePlayerInfo,
  ChallengeResult,
  BidHistoryEntry,
} from '@/types/games/liars-dice';
import { DEFAULT_LIARS_DICE_SETTINGS } from '@/types/games/liars-dice';

// ---- In-memory game store ----
const games = new Map<string, LiarsDiceServerState>();
const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

// ---- Public API ----

export function createGame(room: Room, settings?: Partial<LiarsDiceSettings>): LiarsDiceServerState {
  const mergedSettings: LiarsDiceSettings = { ...DEFAULT_LIARS_DICE_SETTINGS, ...settings };

  // Build seating order from connected players (shuffled)
  const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);
  shuffleArray(playerIds);

  const playerData: LiarsDiceServerState['playerData'] = {};
  for (const id of playerIds) {
    playerData[id] = {
      dice: rollDiceForPlayer(),
      lives: mergedSettings.lives,
      alive: true,
    };
  }

  const state: LiarsDiceServerState = {
    phase: 'rolling',
    playerData,
    seatingOrder: [...playerIds],
    aliveOrder: [...playerIds],
    currentPlayerIndex: 0,
    currentBid: null,
    bidHistory: [],
    roundNumber: 1,
    settings: mergedSettings,
    eliminationOrder: [],
    turnTimerEnd: null,
    challengeResult: null,
    rollsReceived: new Set(),
  };

  games.set(room.code, state);
  console.log(`[LiarsDice] Game created in ${room.code} with ${playerIds.length} players`);
  return state;
}

export function markRollComplete(roomCode: string, playerId: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'rolling') return false;

  state.rollsReceived.add(playerId);
  return true;
}

export function allRollsComplete(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state) return false;

  const connectedAlive = state.aliveOrder.filter(id => room.players[id]?.connected);
  return connectedAlive.every(id => state.rollsReceived.has(id));
}

export function startBidding(roomCode: string): boolean {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'rolling') return false;

  state.phase = 'bidding';
  state.currentBid = null;
  state.bidHistory = [];
  state.challengeResult = null;
  return true;
}

export function placeBid(
  roomCode: string,
  playerId: string,
  quantity: number,
  faceValue: number,
  room: Room
): { success: boolean; error?: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'bidding') return { success: false, error: 'Not in bidding phase' };

  // Verify it's this player's turn
  if (state.aliveOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, error: 'Not your turn' };
  }

  // Verify player is alive
  if (!state.playerData[playerId]?.alive) {
    return { success: false, error: 'Player is eliminated' };
  }

  // Validate face value
  if (faceValue < 1 || faceValue > 6 || !Number.isInteger(faceValue)) {
    return { success: false, error: 'Invalid face value' };
  }

  // Validate quantity
  const totalDice = state.aliveOrder.reduce((sum, id) => sum + state.playerData[id].dice.length, 0);
  if (quantity < 1 || quantity > totalDice || !Number.isInteger(quantity)) {
    return { success: false, error: 'Invalid quantity' };
  }

  // Validate raise: must be higher than current bid
  if (state.currentBid) {
    const validRaise = isValidRaise(state.currentBid.quantity, state.currentBid.faceValue, quantity, faceValue);
    if (!validRaise) {
      return { success: false, error: 'Bid must be higher than current bid' };
    }
  }

  const player = room.players[playerId];
  const entry: BidHistoryEntry = {
    playerId,
    playerName: player?.name || 'Unknown',
    playerAvatar: player?.avatar || '🎲',
    quantity,
    faceValue,
    type: 'bid',
  };

  state.currentBid = { quantity, faceValue, playerId };
  state.bidHistory.push(entry);

  // Advance to next player
  advanceTurn(state);

  return { success: true };
}

export function callLiar(
  roomCode: string,
  playerId: string,
  room: Room
): ChallengeResult | { error: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'bidding') return { error: 'Not in bidding phase' };

  if (state.aliveOrder[state.currentPlayerIndex] !== playerId) {
    return { error: 'Not your turn' };
  }

  if (!state.currentBid) {
    return { error: 'No bid to challenge' };
  }

  const caller = room.players[playerId];
  const bidder = room.players[state.currentBid.playerId];

  // Add to bid history
  state.bidHistory.push({
    playerId,
    playerName: caller?.name || 'Unknown',
    playerAvatar: caller?.avatar || '🎲',
    quantity: state.currentBid.quantity,
    faceValue: state.currentBid.faceValue,
    type: 'liar',
  });

  // Count actual dice
  const actualCount = countDice(state, state.currentBid.faceValue);

  // Bid is correct if actual >= bid quantity
  const bidCorrect = actualCount >= state.currentBid.quantity;

  // If bid correct, challenger loses. If bid wrong, bidder loses.
  const loserId = bidCorrect ? playerId : state.currentBid.playerId;

  const result: ChallengeResult = {
    type: 'liar',
    callerId: playerId,
    callerName: caller?.name || 'Unknown',
    bidderId: state.currentBid.playerId,
    bidderName: bidder?.name || 'Unknown',
    bid: { quantity: state.currentBid.quantity, faceValue: state.currentBid.faceValue },
    actualCount,
    allDice: getAllDice(state),
    loserId,
    loserName: room.players[loserId]?.name || 'Unknown',
    losersIfSpotOn: null,
    wasCorrect: !bidCorrect, // challenge was correct if bid was wrong
  };

  state.challengeResult = result;
  state.phase = 'challenge';

  return result;
}

export function callSpotOn(
  roomCode: string,
  playerId: string,
  room: Room
): ChallengeResult | { error: string } {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'bidding') return { error: 'Not in bidding phase' };

  if (!state.settings.spotOn) return { error: 'Spot On is not enabled' };

  if (state.aliveOrder[state.currentPlayerIndex] !== playerId) {
    return { error: 'Not your turn' };
  }

  if (!state.currentBid) {
    return { error: 'No bid to call spot on' };
  }

  const caller = room.players[playerId];
  const bidder = room.players[state.currentBid.playerId];

  // Add to bid history
  state.bidHistory.push({
    playerId,
    playerName: caller?.name || 'Unknown',
    playerAvatar: caller?.avatar || '🎲',
    quantity: state.currentBid.quantity,
    faceValue: state.currentBid.faceValue,
    type: 'spotOn',
  });

  const actualCount = countDice(state, state.currentBid.faceValue);
  const isExact = actualCount === state.currentBid.quantity;

  let loserId: string;
  let losersIfSpotOn: string[] | null = null;

  if (isExact) {
    // Caller is correct — all OTHER alive players lose a life
    losersIfSpotOn = state.aliveOrder.filter(id => id !== playerId);
    loserId = ''; // no single loser
  } else {
    // Caller is wrong — they lose a life
    loserId = playerId;
  }

  const result: ChallengeResult = {
    type: 'spotOn',
    callerId: playerId,
    callerName: caller?.name || 'Unknown',
    bidderId: state.currentBid.playerId,
    bidderName: bidder?.name || 'Unknown',
    bid: { quantity: state.currentBid.quantity, faceValue: state.currentBid.faceValue },
    actualCount,
    allDice: getAllDice(state),
    loserId,
    loserName: loserId ? (room.players[loserId]?.name || 'Unknown') : '',
    losersIfSpotOn,
    wasCorrect: isExact,
  };

  state.challengeResult = result;
  state.phase = 'challenge';

  return result;
}

/**
 * Apply the challenge result: remove lives, check eliminations.
 * Called after the reveal animation delay.
 */
export function applyChallenge(roomCode: string, room: Room): { eliminated: string[]; gameOver: boolean } {
  const state = games.get(roomCode);
  if (!state || !state.challengeResult) return { eliminated: [], gameOver: false };

  const eliminated: string[] = [];
  const result = state.challengeResult;

  if (result.losersIfSpotOn && result.losersIfSpotOn.length > 0) {
    // Spot On correct — all others lose a life
    for (const id of result.losersIfSpotOn) {
      const pd = state.playerData[id];
      if (pd && pd.alive) {
        pd.lives--;
        if (pd.lives <= 0) {
          pd.alive = false;
          state.eliminationOrder.push(id);
          eliminated.push(id);
        }
      }
    }
  } else if (result.loserId) {
    // Single loser
    const pd = state.playerData[result.loserId];
    if (pd) {
      pd.lives--;
      if (pd.lives <= 0) {
        pd.alive = false;
        state.eliminationOrder.push(result.loserId);
        eliminated.push(result.loserId);
      }
    }
  }

  // Update alive order
  state.aliveOrder = state.seatingOrder.filter(id => state.playerData[id]?.alive);

  // Check game over
  const gameOver = state.aliveOrder.length <= 1;
  if (gameOver) {
    state.phase = 'finished';
  } else {
    state.phase = 'roundEnd';
  }

  return { eliminated, gameOver };
}

/**
 * Start a new round: re-roll dice, set starting player (loser of last round).
 */
export function startNewRound(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state || (state.phase !== 'roundEnd')) return false;

  state.roundNumber++;
  state.currentBid = null;
  state.bidHistory = [];
  state.rollsReceived = new Set();

  // Re-roll dice for all alive players
  for (const id of state.aliveOrder) {
    state.playerData[id].dice = rollDiceForPlayer();
  }

  // Loser of last round starts (if still alive), otherwise next alive player
  const lastResult = state.challengeResult;
  if (lastResult) {
    let starterId: string | null = null;

    if (lastResult.type === 'spotOn' && lastResult.wasCorrect && lastResult.losersIfSpotOn) {
      // Spot-on correct: multiple losers. Pick the first alive loser in seating order.
      starterId = state.aliveOrder.find(id => lastResult.losersIfSpotOn!.includes(id)) || null;
    } else {
      // Normal liar call or spot-on wrong: single loser starts
      starterId = lastResult.loserId || null;
    }

    if (starterId) {
      const starterIndex = state.aliveOrder.indexOf(starterId);
      if (starterIndex !== -1) {
        state.currentPlayerIndex = starterIndex;
      } else {
        state.currentPlayerIndex = 0;
      }
    } else {
      state.currentPlayerIndex = 0;
    }
  }

  state.challengeResult = null;
  state.phase = 'rolling';

  return true;
}

export function getClientState(
  roomCode: string,
  playerId: string,
  room: Room
): LiarsDiceClientState | null {
  const state = games.get(roomCode);
  if (!state) return null;

  const isRevealPhase = state.phase === 'challenge' || state.phase === 'reveal';

  const players: LiarsDicePlayerInfo[] = state.seatingOrder.map(id => {
    const pd = state.playerData[id];
    const rp = room.players[id];
    return {
      id,
      name: rp?.name || 'Unknown',
      avatar: rp?.avatar || '🎲',
      lives: pd?.lives || 0,
      maxLives: state.settings.lives,
      alive: pd?.alive || false,
      connected: rp?.connected || false,
      diceCount: pd?.dice.length || 0,
      dice: isRevealPhase ? (pd?.dice || null) : null,
    };
  });

  const myData = state.playerData[playerId];
  const activePlayerId = state.aliveOrder[state.currentPlayerIndex] || null;

  const currentBid = state.currentBid
    ? {
        quantity: state.currentBid.quantity,
        faceValue: state.currentBid.faceValue,
        playerName: room.players[state.currentBid.playerId]?.name || 'Unknown',
        playerId: state.currentBid.playerId,
      }
    : null;

  const totalDiceOnTable = state.aliveOrder.reduce(
    (sum, id) => sum + (state.playerData[id]?.dice.length || 0),
    0
  );

  return {
    phase: state.phase,
    players,
    myDice: myData?.dice || [],
    currentBid,
    activePlayerId,
    isMyTurn: activePlayerId === playerId && state.phase === 'bidding',
    bidHistory: state.bidHistory,
    roundNumber: state.roundNumber,
    lastChallengeResult: state.challengeResult,
    settings: state.settings,
    eliminationOrder: state.eliminationOrder.map(id => ({
      id,
      name: room.players[id]?.name || 'Unknown',
      avatar: room.players[id]?.avatar || '🎲',
    })),
    totalDiceOnTable,
    isFirstRound: state.roundNumber === 1,
  };
}

export function getGameState(roomCode: string): LiarsDiceServerState | undefined {
  return games.get(roomCode);
}

export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = games.get(roomCode);
  if (!state) return;

  // Swap in playerData
  if (state.playerData[oldId]) {
    state.playerData[newId] = state.playerData[oldId];
    delete state.playerData[oldId];
  }

  // Swap in seatingOrder
  const seatIdx = state.seatingOrder.indexOf(oldId);
  if (seatIdx !== -1) state.seatingOrder[seatIdx] = newId;

  // Swap in aliveOrder
  const aliveIdx = state.aliveOrder.indexOf(oldId);
  if (aliveIdx !== -1) state.aliveOrder[aliveIdx] = newId;

  // Swap in eliminationOrder
  const elimIdx = state.eliminationOrder.indexOf(oldId);
  if (elimIdx !== -1) state.eliminationOrder[elimIdx] = newId;

  // Swap in currentBid
  if (state.currentBid?.playerId === oldId) {
    state.currentBid.playerId = newId;
  }

  // Swap in bidHistory
  for (const entry of state.bidHistory) {
    if (entry.playerId === oldId) entry.playerId = newId;
  }

  // Swap in challengeResult
  if (state.challengeResult) {
    const cr = state.challengeResult;
    if (cr.callerId === oldId) cr.callerId = newId;
    if (cr.bidderId === oldId) cr.bidderId = newId;
    if (cr.loserId === oldId) cr.loserId = newId;
    if (cr.allDice[oldId]) {
      cr.allDice[newId] = cr.allDice[oldId];
      delete cr.allDice[oldId];
    }
    if (cr.losersIfSpotOn) {
      const spotIdx = cr.losersIfSpotOn.indexOf(oldId);
      if (spotIdx !== -1) cr.losersIfSpotOn[spotIdx] = newId;
    }
  }

  // Swap in rollsReceived
  if (state.rollsReceived.has(oldId)) {
    state.rollsReceived.delete(oldId);
    state.rollsReceived.add(newId);
  }

  console.log(`[LiarsDice] Swapped player ID ${oldId} → ${newId}`);
}

export function endGame(roomCode: string): void {
  clearRoomTimer(roomCode);
  games.delete(roomCode);
  console.log(`[LiarsDice] Game ended in ${roomCode}`);
}

export function setRoomTimer(roomCode: string, interval: ReturnType<typeof setInterval>): void {
  clearRoomTimer(roomCode);
  activeTimers.set(roomCode, interval);
}

export function clearRoomTimer(roomCode: string): void {
  const existing = activeTimers.get(roomCode);
  if (existing) {
    clearInterval(existing);
    activeTimers.delete(roomCode);
  }
}

/**
 * Handle disconnected player's turn: auto-call liar.
 */
export function handleDisconnectedTurn(roomCode: string, room: Room): ChallengeResult | null {
  const state = games.get(roomCode);
  if (!state || state.phase !== 'bidding') return null;

  const activeId = state.aliveOrder[state.currentPlayerIndex];
  if (!activeId) return null;

  const player = room.players[activeId];
  if (!player || player.connected) return null;

  // If no bid yet, skip to next player
  if (!state.currentBid) {
    advanceTurn(state);
    return null;
  }

  // Auto-call liar
  const result = callLiar(roomCode, activeId, room);
  if ('error' in result) return null;
  return result;
}

export function getPlayerDice(roomCode: string, playerId: string): number[] | null {
  const state = games.get(roomCode);
  if (!state) return null;
  return state.playerData[playerId]?.dice || null;
}

// ---- Internal helpers ----

function rollDiceForPlayer(): number[] {
  return Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function isValidRaise(
  prevQuantity: number,
  prevFace: number,
  newQuantity: number,
  newFace: number
): boolean {
  // Higher quantity allows any face value
  if (newQuantity > prevQuantity) return true;
  // Same quantity requires higher face value
  if (newQuantity === prevQuantity && newFace > prevFace) return true;
  return false;
}

function countDice(state: LiarsDiceServerState, faceValue: number): number {
  let count = 0;
  for (const id of state.aliveOrder) {
    const pd = state.playerData[id];
    if (!pd) continue;
    for (const die of pd.dice) {
      if (die === faceValue) count++;
      if (state.settings.wildOnes && die === 1 && faceValue !== 1) count++;
    }
  }
  return count;
}

function getAllDice(state: LiarsDiceServerState): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const id of state.aliveOrder) {
    result[id] = [...(state.playerData[id]?.dice || [])];
  }
  return result;
}

function advanceTurn(state: LiarsDiceServerState): void {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.aliveOrder.length;
}
