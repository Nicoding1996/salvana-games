// ============================================
// Poker (Texas Hold'em) — Server Game Logic
// ============================================

import type { Room } from '@/types/hub';
import type {
  PokerServerState, PokerClientState, PokerPlayerInfo,
  PokerSettings, Card, Pot, ShowdownPlayerResult, PokerSuperlative,
  PokerPhase, HandEvaluation,
} from '@/types/games/poker';
import {
  DEFAULT_POKER_SETTINGS, SUITS, RANKS, BLIND_LEVELS,
  BLIND_INCREASE_HANDS,
} from '@/types/games/poker';
import { evaluateHand, compareHands } from './handEvaluator';

// ---- In-memory game state store ----
const games = new Map<string, PokerServerState>();
const roomTimers = new Map<string, ReturnType<typeof setInterval>>();

// ---- Public API ----

export function createGame(room: Room, settings?: Partial<PokerSettings>): PokerServerState {
  const mergedSettings: PokerSettings = { ...DEFAULT_POKER_SETTINGS, ...settings };
  const playerIds = Object.keys(room.players).filter(id => room.players[id].connected);

  const playerData: PokerServerState['playerData'] = {};
  for (const id of playerIds) {
    playerData[id] = {
      holeCards: [],
      chips: mergedSettings.startingChips,
      currentBet: 0,
      totalBetThisHand: 0,
      folded: false,
      allIn: false,
      alive: true,
    };
  }

  const state: PokerServerState = {
    phase: 'dealing',
    deck: [],
    communityCards: [],
    revealedCommunityCount: 0,
    playerData,
    seatingOrder: [...playerIds],
    aliveOrder: [...playerIds],
    dealerIndex: 0,
    currentPlayerIndex: 0,
    bettingOrder: [],
    currentBet: 0,
    minRaise: 0,
    lastRaiser: null,
    actedThisRound: new Set<string>(),
    pots: [{ amount: 0, eligiblePlayerIds: [...playerIds] }],
    actionHistory: [],
    handNumber: 1,
    blindLevel: mergedSettings.startingBlinds === '25/50' ? 1 : 0,
    handsAtCurrentLevel: 0,
    settings: mergedSettings,
    eliminationOrder: [],
    turnTimerEnd: null,
    lastShowdown: null,
    stats: {
      biggestPot: { amount: 0, winnerId: null },
      handsPlayed: {},
      handsWon: {},
      bluffsWon: {},
      eliminations: {},
      biggestAllIn: { amount: 0, playerId: null },
      foldCount: {},
    },
  };

  games.set(room.code, state);
  dealNewHand(room.code);
  return state;
}

/** Deal a new hand: shuffle, deal hole cards, post blinds */
function dealNewHand(roomCode: string): void {
  const state = games.get(roomCode);
  if (!state) return;

  // Reset per-hand state
  state.deck = createShuffledDeck();
  state.communityCards = [];
  state.revealedCommunityCount = 0;
  state.currentBet = 0;
  state.minRaise = 0;
  state.lastRaiser = null;
  state.actedThisRound = new Set<string>();
  state.actionHistory = [];
  state.lastShowdown = null;
  state.pots = [{ amount: 0, eligiblePlayerIds: [...state.aliveOrder] }];

  // Reset player hand state
  for (const id of state.aliveOrder) {
    const pd = state.playerData[id];
    pd.holeCards = [];
    pd.currentBet = 0;
    pd.totalBetThisHand = 0;
    pd.folded = false;
    pd.allIn = false;
  }

  // Deal 2 cards to each alive player
  for (const id of state.aliveOrder) {
    state.playerData[id].holeCards = [state.deck.pop()!, state.deck.pop()!];
  }

  // Deal 5 community cards (face down for now)
  // Burn 1, deal 3 (flop), burn 1, deal 1 (turn), burn 1, deal 1 (river)
  state.deck.pop(); // burn
  state.communityCards.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
  state.deck.pop(); // burn
  state.communityCards.push(state.deck.pop()!);
  state.deck.pop(); // burn
  state.communityCards.push(state.deck.pop()!);

  // Post blinds
  postBlinds(state);

  // Track hands played
  for (const id of state.aliveOrder) {
    state.stats.handsPlayed[id] = (state.stats.handsPlayed[id] || 0) + 1;
  }

  state.phase = 'preflop';
}

/** Post small and big blinds, set up preflop betting order */
function postBlinds(state: PokerServerState): void {
  const numPlayers = state.aliveOrder.length;
  const smallBlind = BLIND_LEVELS[state.blindLevel];
  const bigBlind = smallBlind * 2;

  let sbIndex: number;
  let bbIndex: number;

  if (numPlayers === 2) {
    // Heads-up: dealer is small blind, other is big blind
    sbIndex = state.dealerIndex;
    bbIndex = (state.dealerIndex + 1) % numPlayers;
  } else {
    sbIndex = (state.dealerIndex + 1) % numPlayers;
    bbIndex = (state.dealerIndex + 2) % numPlayers;
  }

  const sbId = state.aliveOrder[sbIndex];
  const bbId = state.aliveOrder[bbIndex];

  // Post small blind
  const sbAmount = Math.min(smallBlind, state.playerData[sbId].chips);
  state.playerData[sbId].chips -= sbAmount;
  state.playerData[sbId].currentBet = sbAmount;
  state.playerData[sbId].totalBetThisHand = sbAmount;
  if (state.playerData[sbId].chips === 0) state.playerData[sbId].allIn = true;

  // Post big blind
  const bbAmount = Math.min(bigBlind, state.playerData[bbId].chips);
  state.playerData[bbId].chips -= bbAmount;
  state.playerData[bbId].currentBet = bbAmount;
  state.playerData[bbId].totalBetThisHand = bbAmount;
  if (state.playerData[bbId].chips === 0) state.playerData[bbId].allIn = true;

  state.pots[0].amount = sbAmount + bbAmount;
  state.currentBet = bbAmount;
  state.minRaise = bigBlind; // minimum raise is one big blind

  // Preflop betting starts left of big blind
  const firstToAct = (bbIndex + 1) % numPlayers;
  state.bettingOrder = buildBettingOrder(state, firstToAct);
  state.currentPlayerIndex = 0;
  state.lastRaiser = null; // No one has raised yet (blinds are forced, not voluntary)
  state.actedThisRound = new Set<string>();
}

/** Build betting order starting from a given index, skipping folded/all-in */
function buildBettingOrder(state: PokerServerState, startIndex: number): string[] {
  const order: string[] = [];
  const n = state.aliveOrder.length;
  for (let i = 0; i < n; i++) {
    const idx = (startIndex + i) % n;
    const id = state.aliveOrder[idx];
    const pd = state.playerData[id];
    if (!pd.folded && !pd.allIn) {
      order.push(id);
    }
  }
  return order;
}

/** Process a player action (fold, check, call, raise, allIn) */
export function playerAction(
  roomCode: string,
  playerId: string,
  action: 'fold' | 'check' | 'call' | 'raise' | 'allIn',
  raiseAmount?: number,
  room?: Room,
): { success: boolean; error?: string; handComplete?: boolean } {
  const state = games.get(roomCode);
  if (!state) return { success: false, error: 'No game' };

  const bettingPhases: PokerPhase[] = ['preflop', 'flop', 'turn', 'river'];
  if (!bettingPhases.includes(state.phase)) return { success: false, error: 'Not a betting phase' };

  if (state.bettingOrder[state.currentPlayerIndex] !== playerId) {
    return { success: false, error: 'Not your turn' };
  }

  const pd = state.playerData[playerId];
  if (!pd || pd.folded || pd.allIn) return { success: false, error: 'Cannot act' };

  const playerName = room?.players[playerId]?.name || 'Unknown';
  const toCall = state.currentBet - pd.currentBet;

  switch (action) {
    case 'fold': {
      pd.folded = true;
      state.stats.foldCount[playerId] = (state.stats.foldCount[playerId] || 0) + 1;
      state.actionHistory.push({ playerId, playerName, action: 'fold', amount: 0, phase: state.phase });
      state.actedThisRound.add(playerId);
      break;
    }
    case 'check': {
      if (toCall > 0) return { success: false, error: 'Cannot check, must call or raise' };
      state.actionHistory.push({ playerId, playerName, action: 'check', amount: 0, phase: state.phase });
      state.actedThisRound.add(playerId);
      break;
    }
    case 'call': {
      if (toCall <= 0) return { success: false, error: 'Nothing to call' };
      const callAmt = Math.min(toCall, pd.chips);
      pd.chips -= callAmt;
      pd.currentBet += callAmt;
      pd.totalBetThisHand += callAmt;
      state.pots[0].amount += callAmt;
      if (pd.chips === 0) pd.allIn = true;
      state.actionHistory.push({ playerId, playerName, action: pd.allIn ? 'allIn' : 'call', amount: callAmt, phase: state.phase });
      state.actedThisRound.add(playerId);
      break;
    }
    case 'raise': {
      const raiseTo = raiseAmount || 0;
      const raiseBy = raiseTo - pd.currentBet;
      if (raiseBy < state.minRaise && raiseBy < pd.chips) {
        return { success: false, error: `Minimum raise is ${state.minRaise}` };
      }
      const actualRaise = Math.min(raiseBy, pd.chips);
      pd.chips -= actualRaise;
      pd.currentBet += actualRaise;
      pd.totalBetThisHand += actualRaise;
      state.pots[0].amount += actualRaise;
      // Update min raise: the raise increment for the next player
      const raiseIncrement = pd.currentBet - state.currentBet;
      state.minRaise = Math.max(raiseIncrement, BLIND_LEVELS[state.blindLevel] * 2);
      state.currentBet = pd.currentBet;
      state.lastRaiser = playerId;
      if (pd.chips === 0) pd.allIn = true;
      state.actionHistory.push({ playerId, playerName, action: pd.allIn ? 'allIn' : 'raise', amount: actualRaise, phase: state.phase });
      // A raise resets the acted set — everyone else needs to act again
      state.actedThisRound = new Set<string>([playerId]);
      // Track biggest all-in
      if (pd.allIn && pd.totalBetThisHand > (state.stats.biggestAllIn.amount || 0)) {
        state.stats.biggestAllIn = { amount: pd.totalBetThisHand, playerId };
      }
      break;
    }
    case 'allIn': {
      const allInAmt = pd.chips;
      pd.currentBet += allInAmt;
      pd.totalBetThisHand += allInAmt;
      pd.chips = 0;
      pd.allIn = true;
      state.pots[0].amount += allInAmt;
      if (pd.currentBet > state.currentBet) {
        // All-in that raises — reset acted set
        state.minRaise = pd.currentBet - state.currentBet;
        state.currentBet = pd.currentBet;
        state.lastRaiser = playerId;
        state.actedThisRound = new Set<string>([playerId]);
      } else {
        // All-in that doesn't raise (short stack call)
        state.actedThisRound.add(playerId);
      }
      state.actionHistory.push({ playerId, playerName, action: 'allIn', amount: allInAmt, phase: state.phase });
      if (pd.totalBetThisHand > (state.stats.biggestAllIn.amount || 0)) {
        state.stats.biggestAllIn = { amount: pd.totalBetThisHand, playerId };
      }
      break;
    }
  }

  // Advance to next player or next phase
  const handComplete = advanceAction(state);
  return { success: true, handComplete };
}

/**
 * Advance action after a player acts.
 * Returns true if the hand is complete (showdown or everyone folded).
 */
function advanceAction(state: PokerServerState): boolean {
  // Check if only one player remains (everyone else folded)
  const activePlayers = state.aliveOrder.filter(id => !state.playerData[id].folded);
  if (activePlayers.length === 1) {
    // Award pot to last player standing
    awardPotToWinner(state, activePlayers[0]);
    state.phase = 'roundEnd';
    return true;
  }

  // Check if all remaining players are all-in (no one can act)
  const canAct = state.aliveOrder.filter(id => {
    const pd = state.playerData[id];
    return !pd.folded && !pd.allIn;
  });

  if (canAct.length === 0) {
    // Everyone is all-in or folded — run out remaining cards
    revealRemainingCards(state);
    resolveShowdown(state);
    return true;
  }

  // Find who just acted (current player before we advance)
  const justActedId = state.bettingOrder[state.currentPlayerIndex];

  // Rebuild betting order (skip folded/all-in)
  const newOrder = state.bettingOrder.filter(id => {
    const pd = state.playerData[id];
    return !pd.folded && !pd.allIn;
  });
  state.bettingOrder = newOrder;

  if (state.bettingOrder.length === 0) {
    // No one can act — run out cards
    revealRemainingCards(state);
    resolveShowdown(state);
    return true;
  }

  // Find the next player after the one who just acted
  const justActedIdx = state.bettingOrder.indexOf(justActedId);
  if (justActedIdx !== -1) {
    // Player is still in the order (didn't fold) — next is idx+1
    state.currentPlayerIndex = (justActedIdx + 1) % state.bettingOrder.length;
  } else {
    // Player folded and was removed — the player who was after them
    // is now at the same position the folder was at (or wrapped)
    // Since we already incremented past them in the old order,
    // find the first player in new order that comes after the old position
    state.currentPlayerIndex = state.currentPlayerIndex % state.bettingOrder.length;
  }

  // Check if the betting round is complete:
  // All remaining players have acted since the last raise AND all bets are matched
  const allMatched = state.bettingOrder.every(id => {
    const pd = state.playerData[id];
    return pd.currentBet === state.currentBet;
  });

  const allHaveActed = state.bettingOrder.every(id => state.actedThisRound.has(id));

  if (allMatched && allHaveActed) {
    return advanceToNextStreet(state);
  }

  return false;
}

/** Advance to the next street (flop, turn, river, or showdown) */
function advanceToNextStreet(state: PokerServerState): boolean {
  // Reset current bets for new round
  for (const id of state.aliveOrder) {
    state.playerData[id].currentBet = 0;
  }
  state.currentBet = 0;
  state.minRaise = BLIND_LEVELS[state.blindLevel] * 2;
  state.lastRaiser = null;
  state.actedThisRound = new Set<string>();

  // Calculate side pots before advancing
  calculateSidePots(state);

  switch (state.phase) {
    case 'preflop':
      state.phase = 'flop';
      state.revealedCommunityCount = 3;
      break;
    case 'flop':
      state.phase = 'turn';
      state.revealedCommunityCount = 4;
      break;
    case 'turn':
      state.phase = 'river';
      state.revealedCommunityCount = 5;
      break;
    case 'river':
      resolveShowdown(state);
      return true;
  }

  // Set up betting order for post-flop (starts left of dealer)
  const numPlayers = state.aliveOrder.length;
  const firstToAct = (state.dealerIndex + 1) % numPlayers;
  state.bettingOrder = buildBettingOrder(state, firstToAct);
  state.currentPlayerIndex = 0;

  // If no one can act (all all-in), run out cards
  if (state.bettingOrder.length <= 1) {
    if (state.bettingOrder.length === 0) {
      revealRemainingCards(state);
      resolveShowdown(state);
      return true;
    }
    // Only one player can act — they can only check, auto-advance
    revealRemainingCards(state);
    resolveShowdown(state);
    return true;
  }

  return false;
}

/** Reveal all remaining community cards (for all-in runout) */
function revealRemainingCards(state: PokerServerState): void {
  state.revealedCommunityCount = 5;
  if (state.phase !== 'river') {
    state.phase = 'river';
  }
}

/** Calculate side pots when players are all-in with different amounts */
function calculateSidePots(state: PokerServerState): void {
  const activePlayers = state.aliveOrder.filter(id => !state.playerData[id].folded);
  const allInPlayers = activePlayers
    .filter(id => state.playerData[id].allIn)
    .sort((a, b) => state.playerData[a].totalBetThisHand - state.playerData[b].totalBetThisHand);

  if (allInPlayers.length === 0) return;

  // All players who contributed to the pot (including folded)
  const allContributors = state.aliveOrder.filter(id => state.playerData[id].totalBetThisHand > 0);

  // Rebuild pots from scratch based on total bets
  const pots: Pot[] = [];
  let processedAmount = 0;

  for (const allInId of allInPlayers) {
    const allInBet = state.playerData[allInId].totalBetThisHand;
    if (allInBet <= processedAmount) continue;

    const potContribution = allInBet - processedAmount;

    // Everyone who bet at least this much contributes to this pot level
    let potAmount = 0;
    for (const id of allContributors) {
      const playerBet = state.playerData[id].totalBetThisHand;
      const contribution = Math.min(playerBet, allInBet) - Math.min(playerBet, processedAmount);
      if (contribution > 0) potAmount += contribution;
    }

    // Only non-folded players who bet enough are eligible to WIN
    const eligible = activePlayers.filter(id =>
      state.playerData[id].totalBetThisHand >= allInBet
    );

    if (potAmount > 0) {
      pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
    }
    processedAmount = allInBet;
  }

  // Main pot for remaining bets above all all-in amounts
  let mainPotAmount = 0;
  for (const id of allContributors) {
    const playerBet = state.playerData[id].totalBetThisHand;
    const contribution = playerBet - Math.min(playerBet, processedAmount);
    if (contribution > 0) mainPotAmount += contribution;
  }

  if (mainPotAmount > 0) {
    const eligible = activePlayers.filter(id =>
      state.playerData[id].totalBetThisHand > processedAmount
    );
    if (eligible.length > 0) {
      pots.push({ amount: mainPotAmount, eligiblePlayerIds: eligible });
    } else {
      // Edge case: only folded players have bets above this level
      // Give it to the last pot's eligible players
      if (pots.length > 0) {
        pots[pots.length - 1].amount += mainPotAmount;
      }
    }
  }

  // If we calculated pots, use them; otherwise keep the simple single pot
  if (pots.length > 0) {
    state.pots = pots;
  }
}

/** Resolve showdown: evaluate hands, award pots */
function resolveShowdown(state: PokerServerState): void {
  state.phase = 'showdown';
  calculateSidePots(state);

  const activePlayers = state.aliveOrder.filter(id => !state.playerData[id].folded);
  const community = state.communityCards.slice(0, 5);

  // Evaluate each player's hand
  const evaluations = new Map<string, HandEvaluation>();
  for (const id of activePlayers) {
    const allCards = [...state.playerData[id].holeCards, ...community];
    evaluations.set(id, evaluateHand(allCards));
  }

  // Award each pot to the winner(s)
  const winnings: Record<string, number> = {};
  for (const pot of state.pots) {
    const eligible = pot.eligiblePlayerIds.filter(id => activePlayers.includes(id));
    if (eligible.length === 0) continue;

    // Find best hand among eligible
    let bestIds: string[] = [eligible[0]];
    let bestEval = evaluations.get(eligible[0])!;

    for (let i = 1; i < eligible.length; i++) {
      const eval2 = evaluations.get(eligible[i])!;
      const cmp = compareHands(eval2, bestEval);
      if (cmp > 0) {
        bestIds = [eligible[i]];
        bestEval = eval2;
      } else if (cmp === 0) {
        bestIds.push(eligible[i]);
      }
    }

    // Split pot among winners
    const share = Math.floor(pot.amount / bestIds.length);
    const remainder = pot.amount - share * bestIds.length;
    for (let i = 0; i < bestIds.length; i++) {
      const amount = share + (i === 0 ? remainder : 0);
      winnings[bestIds[i]] = (winnings[bestIds[i]] || 0) + amount;
      state.playerData[bestIds[i]].chips += amount;
    }
  }

  // Track stats
  const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0);
  if (totalPot > state.stats.biggestPot.amount) {
    const topWinner = Object.entries(winnings).sort((a, b) => b[1] - a[1])[0];
    state.stats.biggestPot = { amount: totalPot, winnerId: topWinner?.[0] || null };
  }
  for (const winnerId of Object.keys(winnings)) {
    state.stats.handsWon[winnerId] = (state.stats.handsWon[winnerId] || 0) + 1;
    // Check if winner had the best hand (not a bluff win)
    const winnerEval = evaluations.get(winnerId);
    if (winnerEval && activePlayers.length > 1) {
      const otherEvals = activePlayers
        .filter(id => id !== winnerId)
        .map(id => evaluations.get(id)!);
      const hadBestHand = otherEvals.every(e => compareHands(winnerEval, e) >= 0);
      if (!hadBestHand) {
        state.stats.bluffsWon[winnerId] = (state.stats.bluffsWon[winnerId] || 0) + 1;
      }
    }
  }

  // Build showdown result for client
  const showdownPlayers: ShowdownPlayerResult[] = activePlayers.map(id => ({
    playerId: id,
    playerName: '', // filled in getClientState
    avatar: '',
    holeCards: state.playerData[id].holeCards,
    handEvaluation: evaluations.get(id)!,
    potWon: winnings[id] || 0,
    isWinner: (winnings[id] || 0) > 0,
  }));

  state.lastShowdown = {
    players: showdownPlayers,
    communityCards: community,
    pots: state.pots,
    winners: Object.entries(winnings).map(([id, amount]) => ({
      playerId: id,
      playerName: '',
      amount,
    })),
  };

  state.phase = 'roundEnd';
}

/** Award pot to a single winner (everyone else folded) */
function awardPotToWinner(state: PokerServerState, winnerId: string): void {
  const totalPot = state.pots.reduce((sum, p) => sum + p.amount, 0);
  state.playerData[winnerId].chips += totalPot;

  // Track stats
  state.stats.handsWon[winnerId] = (state.stats.handsWon[winnerId] || 0) + 1;
  state.stats.bluffsWon[winnerId] = (state.stats.bluffsWon[winnerId] || 0) + 1;
  if (totalPot > state.stats.biggestPot.amount) {
    state.stats.biggestPot = { amount: totalPot, winnerId };
  }

  state.lastShowdown = null; // No showdown when everyone folds
}

/** Start the next hand (called after roundEnd pause) */
export function startNextHand(roomCode: string, room: Room): { gameOver: boolean } {
  const state = games.get(roomCode);
  if (!state) return { gameOver: true };

  // Eliminate players with 0 chips
  const eliminated: string[] = [];
  for (const id of state.aliveOrder) {
    if (state.playerData[id].chips <= 0) {
      state.playerData[id].alive = false;
      eliminated.push(id);
      state.eliminationOrder.push(id);
    }
  }

  // Track eliminations (credit to the player who won the pot)
  if (eliminated.length > 0 && state.lastShowdown) {
    const winner = state.lastShowdown.winners[0];
    if (winner) {
      state.stats.eliminations[winner.playerId] =
        (state.stats.eliminations[winner.playerId] || 0) + eliminated.length;
    }
  }

  // Update alive order
  state.aliveOrder = state.aliveOrder.filter(id => state.playerData[id].alive);

  // Check if game is over
  if (state.aliveOrder.length <= 1) {
    state.phase = 'finished';
    return { gameOver: true };
  }

  // Advance dealer button
  state.dealerIndex = (state.dealerIndex + 1) % state.aliveOrder.length;

  // Advance blind level
  state.handsAtCurrentLevel++;
  const handsToIncrease = BLIND_INCREASE_HANDS[state.settings.blindStructure];
  if (state.handsAtCurrentLevel >= handsToIncrease && state.blindLevel < BLIND_LEVELS.length - 1) {
    state.blindLevel++;
    state.handsAtCurrentLevel = 0;
  }

  state.handNumber++;
  dealNewHand(roomCode);
  return { gameOver: false };
}

/** Get personalized client state for a specific player */
export function getClientState(roomCode: string, playerId: string, room: Room): PokerClientState | null {
  const state = games.get(roomCode);
  if (!state) return null;

  const bettingPhases: PokerPhase[] = ['preflop', 'flop', 'turn', 'river'];

  const myData = state.playerData[playerId];
  const activeId = state.bettingOrder[state.currentPlayerIndex] || null;
  const smallBlind = BLIND_LEVELS[state.blindLevel];
  const bigBlind = smallBlind * 2;

  // Determine dealer, SB, BB positions
  const numAlive = state.aliveOrder.length;
  let sbIndex: number, bbIndex: number;
  if (numAlive === 2) {
    sbIndex = state.dealerIndex;
    bbIndex = (state.dealerIndex + 1) % numAlive;
  } else {
    sbIndex = (state.dealerIndex + 1) % numAlive;
    bbIndex = (state.dealerIndex + 2) % numAlive;
  }

  const players: PokerPlayerInfo[] = state.seatingOrder.map(id => {
    const pd = state.playerData[id];
    const player = room.players[id];
    const aliveIdx = state.aliveOrder.indexOf(id);

    // During showdown, reveal hole cards for active (non-folded) players
    let holeCards: Card[] | null = null;
    let handDesc: string | null = null;
    if (state.phase === 'showdown' || state.phase === 'roundEnd') {
      if (state.lastShowdown) {
        const showdownPlayer = state.lastShowdown.players.find(p => p.playerId === id);
        if (showdownPlayer) {
          holeCards = showdownPlayer.holeCards;
          handDesc = showdownPlayer.handEvaluation.description;
        }
      }
    }

    return {
      id,
      name: player?.name || 'Unknown',
      avatar: player?.avatar || '😎',
      chips: pd.chips,
      currentBet: pd.currentBet,
      totalBetThisHand: pd.totalBetThisHand,
      folded: pd.folded,
      allIn: pd.allIn,
      alive: pd.alive,
      connected: player?.connected ?? false,
      isDealer: aliveIdx === state.dealerIndex,
      isSmallBlind: aliveIdx === sbIndex,
      isBigBlind: aliveIdx === bbIndex,
      holeCards,
      handDescription: handDesc,
      isWinner: state.lastShowdown?.winners.some(w => w.playerId === id) ?? false,
    };
  });

  // Calculate call amount and min raise for current player
  const toCall = myData ? Math.min(state.currentBet - (myData.currentBet || 0), myData.chips) : 0;
  const minRaiseTotal = state.currentBet + state.minRaise;

  // Evaluate player's current hand strength (for helper)
  let myHandStrength: HandEvaluation | null = null;
  if (myData && myData.holeCards.length === 2 && state.revealedCommunityCount > 0) {
    const visibleCommunity = state.communityCards.slice(0, state.revealedCommunityCount);
    const allCards = [...myData.holeCards, ...visibleCommunity];
    if (allCards.length >= 5) {
      myHandStrength = evaluateHand(allCards);
    }
  }

  return {
    phase: state.phase,
    players,
    myCards: myData?.holeCards || [],
    communityCards: state.communityCards.slice(0, state.revealedCommunityCount),
    pots: state.pots,
    currentBet: state.currentBet,
    activePlayerId: bettingPhases.includes(state.phase) ? activeId : null,
    isMyTurn: bettingPhases.includes(state.phase) && activeId === playerId,
    minRaise: minRaiseTotal,
    callAmount: Math.max(0, toCall),
    handNumber: state.handNumber,
    blindLevel: smallBlind,
    nextBlindIncrease: BLIND_INCREASE_HANDS[state.settings.blindStructure] - state.handsAtCurrentLevel,
    actionHistory: state.actionHistory,
    lastShowdown: state.lastShowdown ? {
      ...state.lastShowdown,
      players: state.lastShowdown.players.map(p => ({
        ...p,
        playerName: room.players[p.playerId]?.name || 'Unknown',
        avatar: room.players[p.playerId]?.avatar || '😎',
      })),
      winners: state.lastShowdown.winners.map(w => ({
        ...w,
        playerName: room.players[w.playerId]?.name || 'Unknown',
      })),
    } : null,
    eliminationOrder: state.eliminationOrder.map(id => ({
      id,
      name: room.players[id]?.name || 'Unknown',
      avatar: room.players[id]?.avatar || '😎',
    })),
    settings: state.settings,
    isFirstHand: state.handNumber === 1,
    myHandStrength,
  };
}

/** Get superlatives for end-of-game screen */
export function getSuperlatives(roomCode: string, room: Room): PokerSuperlative[] {
  const state = games.get(roomCode);
  if (!state) return [];

  const superlatives: PokerSuperlative[] = [];
  const getName = (id: string) => room.players[id]?.name || 'Unknown';

  // Biggest Bluff — most pots won without best hand
  const topBluffer = Object.entries(state.stats.bluffsWon).sort((a, b) => b[1] - a[1])[0];
  if (topBluffer && topBluffer[1] > 0) {
    superlatives.push({
      emoji: '🎭', title: 'Biggest Bluffer',
      playerId: topBluffer[0], playerName: getName(topBluffer[0]),
      value: `${topBluffer[1]} bluff wins`,
    });
  }

  // High Roller — biggest pot won
  if (state.stats.biggestPot.winnerId) {
    superlatives.push({
      emoji: '💰', title: 'High Roller',
      playerId: state.stats.biggestPot.winnerId,
      playerName: getName(state.stats.biggestPot.winnerId),
      value: `${state.stats.biggestPot.amount} chip pot`,
    });
  }

  // Ice Cold — highest fold rate
  const foldRates = Object.entries(state.stats.foldCount)
    .map(([id, folds]) => ({ id, rate: folds / (state.stats.handsPlayed[id] || 1) }))
    .sort((a, b) => b.rate - a.rate);
  if (foldRates[0] && foldRates[0].rate > 0.3) {
    superlatives.push({
      emoji: '🧊', title: 'Ice Cold',
      playerId: foldRates[0].id, playerName: getName(foldRates[0].id),
      value: `Folded ${Math.round(foldRates[0].rate * 100)}% of hands`,
    });
  }

  // Loose Cannon — lowest fold rate
  const loosest = [...foldRates].sort((a, b) => a.rate - b.rate);
  if (loosest[0] && loosest[0].id !== foldRates[0]?.id) {
    superlatives.push({
      emoji: '🔥', title: 'Loose Cannon',
      playerId: loosest[0].id, playerName: getName(loosest[0].id),
      value: `Folded only ${Math.round(loosest[0].rate * 100)}% of hands`,
    });
  }

  // Bounty Hunter — most eliminations
  const topEliminator = Object.entries(state.stats.eliminations).sort((a, b) => b[1] - a[1])[0];
  if (topEliminator && topEliminator[1] > 0) {
    superlatives.push({
      emoji: '💀', title: 'Bounty Hunter',
      playerId: topEliminator[0], playerName: getName(topEliminator[0]),
      value: `${topEliminator[1]} eliminations`,
    });
  }

  return superlatives;
}

// ---- Utility Exports ----

export function getGameState(roomCode: string): PokerServerState | undefined {
  return games.get(roomCode);
}

export function endGame(roomCode: string): void {
  clearRoomTimer(roomCode);
  games.delete(roomCode);
}

export function setRoomTimer(roomCode: string, interval: ReturnType<typeof setInterval>): void {
  roomTimers.set(roomCode, interval);
}

export function clearRoomTimer(roomCode: string): void {
  const timer = roomTimers.get(roomCode);
  if (timer) {
    clearInterval(timer);
    roomTimers.delete(roomCode);
  }
}

/** Swap player ID on reconnection */
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

  // Swap in bettingOrder
  const betIdx = state.bettingOrder.indexOf(oldId);
  if (betIdx !== -1) state.bettingOrder[betIdx] = newId;

  // Swap in pots
  for (const pot of state.pots) {
    const potIdx = pot.eligiblePlayerIds.indexOf(oldId);
    if (potIdx !== -1) pot.eligiblePlayerIds[potIdx] = newId;
  }

  // Swap in action history
  for (const entry of state.actionHistory) {
    if (entry.playerId === oldId) entry.playerId = newId;
  }

  // Swap in elimination order
  const elimIdx = state.eliminationOrder.indexOf(oldId);
  if (elimIdx !== -1) state.eliminationOrder[elimIdx] = newId;

  // Swap in lastRaiser
  if (state.lastRaiser === oldId) state.lastRaiser = newId;

  // Swap in actedThisRound
  if (state.actedThisRound.has(oldId)) {
    state.actedThisRound.delete(oldId);
    state.actedThisRound.add(newId);
  }

  // Swap in stats
  const swapStat = (stat: Record<string, number>) => {
    if (stat[oldId] !== undefined) {
      stat[newId] = stat[oldId];
      delete stat[oldId];
    }
  };
  swapStat(state.stats.handsPlayed);
  swapStat(state.stats.handsWon);
  swapStat(state.stats.bluffsWon);
  swapStat(state.stats.eliminations);
  swapStat(state.stats.foldCount);
  if (state.stats.biggestPot.winnerId === oldId) state.stats.biggestPot.winnerId = newId;
  if (state.stats.biggestAllIn.playerId === oldId) state.stats.biggestAllIn.playerId = newId;

  // Swap in showdown result
  if (state.lastShowdown) {
    for (const p of state.lastShowdown.players) {
      if (p.playerId === oldId) p.playerId = newId;
    }
    for (const w of state.lastShowdown.winners) {
      if (w.playerId === oldId) w.playerId = newId;
    }
  }
}

/** Handle disconnected player's turn — auto-fold (or check if possible) */
export function handleDisconnectedTurn(roomCode: string, room: Room): boolean {
  const state = games.get(roomCode);
  if (!state) return false;

  const activeId = state.bettingOrder[state.currentPlayerIndex];
  if (!activeId) return false;

  const pd = state.playerData[activeId];
  const toCall = state.currentBet - pd.currentBet;

  if (toCall === 0) {
    // Can check — auto-check
    playerAction(roomCode, activeId, 'check', undefined, room);
  } else {
    // Must call — auto-fold
    playerAction(roomCode, activeId, 'fold', undefined, room);
  }
  return true;
}

// ---- Private Helpers ----

/** Create a shuffled 52-card deck */
function createShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
