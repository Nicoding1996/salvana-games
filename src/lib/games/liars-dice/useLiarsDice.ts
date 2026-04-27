'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { LiarsDiceClientState, ChallengeResult } from '@/types/games/liars-dice';

const initialState: LiarsDiceClientState = {
  phase: 'rolling',
  players: [],
  myDice: [],
  currentBid: null,
  activePlayerId: null,
  isMyTurn: false,
  bidHistory: [],
  roundNumber: 1,
  lastChallengeResult: null,
  settings: { maxPlayers: 4, lives: 2, wildOnes: false, spotOn: false, turnTimer: 30 },
  eliminationOrder: [],
  totalDiceOnTable: 0,
  isFirstRound: true,
};

// Module-level state — survives component remounts
let _gameState: LiarsDiceClientState = initialState;
let _myDice: number[] = [];
let _turnTimer: number | null = null;
let _challengeResult: ChallengeResult | null = null;
const _listeners = new Set<() => void>();
let _socketBound = false;

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

function ensureSocketBound() {
  if (_socketBound) return;
  _socketBound = true;

  const socket = getSocket();

  socket.on('liars-dice:stateUpdated', (state) => {
    _gameState = state;
    _myDice = state.myDice;
    if (state.lastChallengeResult) {
      _challengeResult = state.lastChallengeResult;
    } else if (state.phase === 'rolling' || state.phase === 'bidding') {
      _challengeResult = null;
    }
    notifyListeners();
  });

  socket.on('liars-dice:diceRolled', (dice) => {
    _myDice = dice;
    notifyListeners();
  });

  socket.on('liars-dice:turnTimer', (secondsLeft) => {
    _turnTimer = secondsLeft;
    notifyListeners();
  });

  socket.on('liars-dice:challengeResult', (result) => {
    _challengeResult = result;
    notifyListeners();
  });
}

export function useLiarsDice() {
  const [gameState, setGameState] = useState<LiarsDiceClientState>(_gameState);
  const [myDice, setMyDice] = useState<number[]>(_myDice);
  const [turnTimer, setTurnTimer] = useState<number | null>(_turnTimer);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(_challengeResult);

  useEffect(() => {
    ensureSocketBound();

    const listener = () => {
      setGameState(_gameState);
      setMyDice(_myDice);
      setTurnTimer(_turnTimer);
      setChallengeResult(_challengeResult);
    };
    _listeners.add(listener);

    // Sync immediately
    listener();

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  const rollComplete = useCallback(() => {
    getSocket().emit('liars-dice:rollComplete');
  }, []);

  const placeBid = useCallback((quantity: number, faceValue: number) => {
    getSocket().emit('liars-dice:placeBid', { quantity, faceValue });
  }, []);

  const callLiar = useCallback(() => {
    getSocket().emit('liars-dice:callLiar');
  }, []);

  const callSpotOn = useCallback(() => {
    getSocket().emit('liars-dice:callSpotOn');
  }, []);

  const nextRound = useCallback(() => {
    getSocket().emit('liars-dice:nextRound');
  }, []);

  const endGame = useCallback(() => {
    getSocket().emit('liars-dice:endGame');
  }, []);

  const rematch = useCallback(() => {
    getSocket().emit('liars-dice:rematch');
  }, []);

  return {
    gameState,
    myDice,
    turnTimer,
    challengeResult,
    rollComplete,
    placeBid,
    callLiar,
    callSpotOn,
    nextRound,
    endGame,
    rematch,
  };
}
