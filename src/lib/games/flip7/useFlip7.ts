'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { Flip7ClientState, Card } from '@/types/games/flip7';

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
let _lastFlipEvent: {
  playerId: string;
  playerName: string;
  card: Card;
  result: 'safe' | 'bust' | 'secondChance';
} | null = null;
let _actionNotification: {
  type: 'freeze' | 'flipThree';
  byName: string;
  targetId: string;
  targetName: string;
} | null = null;
const _listeners = new Set<() => void>();
let _socketBound = false;

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

function ensureSocketBound() {
  if (_socketBound) return;
  _socketBound = true;

  const socket = getSocket();

  socket.on('flip7:stateUpdated', (state) => {
    _gameState = state;
    // Reset chaos submission flag when new state arrives (new tick)
    if (state.settings.mode === 'chaos' && state.phase === 'playing') {
      _chaosSubmitted = false;
    }
    notifyListeners();
  });

  socket.on('flip7:cardFlipped', (event) => {
    _lastFlipEvent = event;
    notifyListeners();
    // Clear after animation duration — longer for busts so player can see what happened
    const duration = event.result === 'bust' ? 2500 : 1500;
    setTimeout(() => {
      _lastFlipEvent = null;
      notifyListeners();
    }, duration);
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
  const [turnTimer, setTurnTimer] = useState<number | null>(_turnTimer);
  const [lastFlipEvent, setLastFlipEvent] = useState(_lastFlipEvent);
  const [chaosSubmitted, setChaosSubmitted] = useState(_chaosSubmitted);
  const [actionNotification, setActionNotification] = useState(_actionNotification);

  useEffect(() => {
    ensureSocketBound();

    const listener = () => {
      setGameState(_gameState);
      setTurnTimer(_turnTimer);
      setLastFlipEvent(_lastFlipEvent);
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
    turnTimer,
    lastFlipEvent,
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
