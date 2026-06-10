'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { Flip7ClientState, Card } from '@/types/games/flip7';
import { FLIP_CARD_DISPLAY_MS, FLIP_BUST_DISPLAY_MS, FLIP_CARD_GAP_MS } from '@/types/games/flip7';
import type { ModifierCardKind } from '@/types/games/flip7';

const initialState: Flip7ClientState = {
  phase: 'dealing',
  players: [],
  myCards: [],
  myModifiers: [],
  mySecondChances: 0,
  myRoundStatus: 'active',
  activePlayerId: null,
  isMyTurn: false,
  deckRemaining: 94,
  round: 1,
  dealerIndex: 0,
  settings: { maxPlayers: 8, targetScore: 200, turnTimer: 15, mode: 'classic' },
  pendingAction: null,
  pendingModifier: null,
  lastFlip: null,
  roundScores: null,
  winnerId: null,
  activityLog: [],
  flipSevenAchievedBy: null,
};

// Module-level state — survives component remounts
let _gameState: Flip7ClientState = initialState;
let _turnTimer: number | null = null;
let _chaosSubmitted = false;
type FlipEvent = {
  playerId: string;
  playerName: string;
  card: Card;
  result: 'safe' | 'bust' | 'secondChance';
};
let _lastFlipEvent: FlipEvent | null = null;
// Flip animations are queued and played one at a time so multi-card draws
// (e.g. Flip Three) show each card sequentially instead of clobbering each other.
let _flipQueue: FlipEvent[] = [];
let _flipPlaying = false;
// Generation token — bumped whenever the queue is force-cleared (round end,
// game switch) so any in-flight timers from the previous sequence no-op.
let _flipGen = 0;
// Incrementing key so the FlipAnimation component remounts per card and replays
// its entrance animation even when consecutive cards are similar.
let _flipKey = 0;
let _actionNotification: {
  type: 'freeze' | 'flipThree';
  byId: string;
  byName: string;
  targetId: string;
  targetName: string;
} | null = null;
const _listeners = new Set<() => void>();
let _socketBound = false;

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

// Drain the flip queue one card at a time. Each card displays for its full
// duration, then a short gap, before the next card animates in.
function playNextFlip() {
  const gen = _flipGen;
  const next = _flipQueue.shift();
  if (!next) {
    _flipPlaying = false;
    _lastFlipEvent = null;
    notifyListeners();
    return;
  }
  _flipPlaying = true;
  _flipKey++;
  _lastFlipEvent = next;
  notifyListeners();
  // Longer for busts so the player can see what happened.
  const duration = next.result === 'bust' ? FLIP_BUST_DISPLAY_MS : FLIP_CARD_DISPLAY_MS;
  setTimeout(() => {
    if (gen !== _flipGen) return; // queue was cleared (round ended) — abort
    _lastFlipEvent = null;
    notifyListeners();
    if (_flipQueue.length > 0) {
      // Brief gap so the next card's entrance animation visibly replays.
      setTimeout(() => {
        if (gen !== _flipGen) return;
        playNextFlip();
      }, FLIP_CARD_GAP_MS);
    } else {
      _flipPlaying = false;
    }
  }, duration);
}

// Force-stop any in-progress flip sequence. Used when the round ends so
// leftover queued cards don't animate over the round summary.
function clearFlips() {
  _flipGen++;
  _flipQueue = [];
  _flipPlaying = false;
  _lastFlipEvent = null;
}

function removeOnce<T>(arr: T[], pred: (x: T) => boolean): T[] {
  const idx = arr.findIndex(pred);
  if (idx === -1) return arr;
  return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
}

// Cards still waiting in the queue or currently animating in the overlay are
// "held" — they shouldn't appear on the table yet. This derives a display copy
// of the state with those cards hidden, so each card lands in the hand exactly
// when its overlay animation finishes (rather than the table spoiling them all
// at once). Only card-display fields are masked; control fields are untouched.
function computeDisplayState(state: Flip7ClientState): Flip7ClientState {
  const held: FlipEvent[] = [];
  if (_lastFlipEvent) held.push(_lastFlipEvent);
  for (const e of _flipQueue) held.push(e);
  if (held.length === 0) return state;

  const heldByPlayer = new Map<string, FlipEvent[]>();
  for (const e of held) {
    const arr = heldByPlayer.get(e.playerId) ?? [];
    arr.push(e);
    heldByPlayer.set(e.playerId, arr);
  }

  // Extract what a player's held events hide from their hand.
  const heldHand = (events: FlipEvent[]) => {
    const numbers: number[] = [];
    const modifiers: ModifierCardKind[] = [];
    let bust = false;
    for (const e of events) {
      if (e.card.type === 'number' && e.result === 'safe') numbers.push(e.card.value);
      else if (e.card.type === 'modifier') modifiers.push(e.card.kind);
      if (e.result === 'bust') bust = true;
    }
    return { numbers, modifiers, bust };
  };

  const players = state.players.map(p => {
    const events = heldByPlayer.get(p.id);
    if (!events || events.length === 0) return p;
    const { numbers, modifiers, bust } = heldHand(events);
    let visibleCards = p.visibleCards;
    for (const v of numbers) visibleCards = removeOnce(visibleCards, x => x === v);
    let mods = p.modifiers;
    for (const m of modifiers) mods = removeOnce(mods, x => x === m);
    return {
      ...p,
      visibleCards,
      modifiers: mods,
      roundStatus: bust ? 'active' : p.roundStatus,
      bustCard: bust ? null : p.bustCard,
    };
  });

  const myId = getSocket().id;
  const myEvents = myId ? heldByPlayer.get(myId) : undefined;
  if (!myEvents || myEvents.length === 0) {
    return { ...state, players };
  }
  const { numbers, modifiers, bust } = heldHand(myEvents);
  let myCards = state.myCards;
  for (const v of numbers) myCards = removeOnce(myCards, c => c.type === 'number' && c.value === v);
  let myModifiers = state.myModifiers;
  for (const m of modifiers) myModifiers = removeOnce(myModifiers, x => x === m);

  return {
    ...state,
    players,
    myCards,
    myModifiers,
    myRoundStatus: bust ? 'active' : state.myRoundStatus,
  };
}

function resetState() {
  _gameState = initialState;
  _turnTimer = null;
  _chaosSubmitted = false;
  clearFlips();
  _actionNotification = null;
  notifyListeners();
}

function ensureSocketBound() {
  if (_socketBound) return;
  _socketBound = true;

  const socket = getSocket();

  // Clear flip7 state when room switches away from flip7
  socket.on('hub:roomUpdated', (room: { currentGameId?: string | null; phase?: string }) => {
    if (_gameState !== initialState && room.currentGameId !== 'flip7') {
      resetState();
    }
  });

  socket.on('flip7:stateUpdated', (state) => {
    _gameState = state;
    // Round/game is over — stop any in-flight flip animations so they don't
    // play over the round summary or game-over screen.
    if (state.phase === 'roundEnd' || state.phase === 'finished') {
      clearFlips();
      // Drop any freeze/flipThree notification so its animation can't replay
      // when the playing UI re-mounts at the start of the next round.
      _actionNotification = null;
    }
    // Reset chaos submission flag when new state arrives (new tick)
    if (state.settings.mode === 'chaos' && state.phase === 'playing') {
      _chaosSubmitted = false;
    }
    notifyListeners();
  });

  socket.on('flip7:cardFlipped', (event) => {
    _flipQueue.push(event);
    if (!_flipPlaying) {
      playNextFlip();
    }
  });

  socket.on('flip7:turnTimer', (secondsLeft) => {
    _turnTimer = secondsLeft;
    notifyListeners();
  });

  socket.on('flip7:actionUsed', (data) => {
    _actionNotification = data;
    notifyListeners();
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      _actionNotification = null;
      notifyListeners();
    }, 3000);
  });

  socket.on('flip7:roundEnd', (data) => {
    clearFlips();
    _actionNotification = null;
    _gameState = {
      ..._gameState,
      phase: 'roundEnd',
      roundScores: data.scores.map(s => ({
        ...s,
        playerName: _gameState.players.find(p => p.id === s.playerId)?.name || 'Unknown',
      })),
      winnerId: data.winnerId,
      flipSevenAchievedBy: data.flipSevenBy,
    };
    _turnTimer = null;
    notifyListeners();
  });
}

export function useFlip7() {
  const [gameState, setGameState] = useState<Flip7ClientState>(_gameState);
  const [displayState, setDisplayState] = useState<Flip7ClientState>(() => computeDisplayState(_gameState));
  const [turnTimer, setTurnTimer] = useState<number | null>(_turnTimer);
  const [lastFlipEvent, setLastFlipEvent] = useState(_lastFlipEvent);
  const [flipKey, setFlipKey] = useState(_flipKey);
  const [chaosSubmitted, setChaosSubmitted] = useState(_chaosSubmitted);
  const [actionNotification, setActionNotification] = useState(_actionNotification);

  useEffect(() => {
    ensureSocketBound();

    const listener = () => {
      setGameState(_gameState);
      setDisplayState(computeDisplayState(_gameState));
      setTurnTimer(_turnTimer);
      setLastFlipEvent(_lastFlipEvent);
      setFlipKey(_flipKey);
      setChaosSubmitted(_chaosSubmitted);
      setActionNotification(_actionNotification);
    };
    _listeners.add(listener);

    // Sync immediately
    listener();

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  const hit = useCallback(() => {
    getSocket().emit('flip7:hit');
  }, []);

  const stay = useCallback(() => {
    getSocket().emit('flip7:stay');
  }, []);

  const useAction = useCallback((targetId: string) => {
    getSocket().emit('flip7:useAction', { targetId });
  }, []);

  const giveModifier = useCallback((targetId: string | null) => {
    getSocket().emit('flip7:giveModifier', { targetId });
  }, []);

  const chaosChoice = useCallback((choice: 'hit' | 'stay') => {
    _chaosSubmitted = true;
    notifyListeners();
    getSocket().emit('flip7:chaosChoice', { choice });
  }, []);

  const nextRound = useCallback(() => {
    getSocket().emit('flip7:nextRound');
  }, []);

  const endGame = useCallback(() => {
    getSocket().emit('flip7:endGame');
  }, []);

  const rematch = useCallback(() => {
    getSocket().emit('flip7:rematch');
  }, []);

  return {
    gameState,
    displayState,
    turnTimer,
    lastFlipEvent,
    flipKey,
    chaosSubmitted,
    actionNotification,
    hit,
    stay,
    useAction,
    giveModifier,
    chaosChoice,
    nextRound,
    endGame,
    rematch,
  };
}
