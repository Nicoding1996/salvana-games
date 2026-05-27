'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { BattleshipClientState, ShipPlacement, Coordinate, ShotEntry } from '@/types/games/battleship';
import { DEFAULT_BATTLESHIP_SETTINGS } from '@/types/games/battleship';

const initialState: BattleshipClientState = {
  phase: 'placement',
  players: [],
  myGrid: [],
  myShipMap: [],
  attackGrids: {},
  activePlayerId: null,
  isMyTurn: false,
  shotsRemaining: 0,
  currentTurnShots: [],
  roundNumber: 1,
  settings: DEFAULT_BATTLESHIP_SETTINGS,
  lastTurnSummary: null,
  sonarUsed: false,
  gridSize: 7,
  isFirstRound: true,
};

// Module-level state — survives component remounts
let _gameState: BattleshipClientState = initialState;
let _turnTimer: number | null = null;
let _placementTimer: number | null = null;
let _shotResult: ShotEntry | null = null;
let _sonarResult: { hasShip: boolean; topLeft: { row: number; col: number }; targetId: string } | null = null;
const _listeners = new Set<() => void>();
let _socketBound = false;

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

function resetState() {
  _gameState = initialState;
  _turnTimer = null;
  _placementTimer = null;
  _shotResult = null;
  _sonarResult = null;
  notifyListeners();
}

function ensureSocketBound() {
  if (_socketBound) return;
  _socketBound = true;

  const socket = getSocket();

  socket.on('battleship:stateUpdated', (state: BattleshipClientState) => {
    _gameState = state;
    notifyListeners();
  });

  // Clear battleship state when room switches away from battleship
  socket.on('hub:roomUpdated', (room: { currentGameId?: string | null; phase?: string }) => {
    if (_gameState !== initialState && room.currentGameId !== 'battleship') {
      resetState();
    }
  });

  socket.on('battleship:turnTimer', (secondsLeft: number) => {
    _turnTimer = secondsLeft;
    notifyListeners();
  });

  socket.on('battleship:placementTimer', (secondsLeft: number) => {
    _placementTimer = secondsLeft;
    notifyListeners();
  });

  socket.on('battleship:shotResult', (shot: ShotEntry) => {
    _shotResult = shot;
    notifyListeners();
    // Clear after animation time
    setTimeout(() => {
      _shotResult = null;
      notifyListeners();
    }, 2000);
  });

  socket.on('battleship:sonarResult', (data: { hasShip: boolean; topLeft: { row: number; col: number }; targetId: string }) => {
    _sonarResult = data;
    notifyListeners();
    // Clear after display time
    setTimeout(() => {
      _sonarResult = null;
      notifyListeners();
    }, 4000);
  });
}

export function useBattleship() {
  const [gameState, setGameState] = useState<BattleshipClientState>(_gameState);
  const [turnTimer, setTurnTimer] = useState<number | null>(_turnTimer);
  const [placementTimer, setPlacementTimer] = useState<number | null>(_placementTimer);
  const [shotResult, setShotResult] = useState<ShotEntry | null>(_shotResult);
  const [sonarResult, setSonarResult] = useState<typeof _sonarResult>(_sonarResult);

  useEffect(() => {
    ensureSocketBound();

    const listener = () => {
      setGameState(_gameState);
      setTurnTimer(_turnTimer);
      setPlacementTimer(_placementTimer);
      setShotResult(_shotResult);
      setSonarResult(_sonarResult);
    };
    _listeners.add(listener);

    // Sync immediately
    listener();

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  const placeShips = useCallback((placements: ShipPlacement[]) => {
    getSocket().emit('battleship:placeShips', { placements });
  }, []);

  const autoPlace = useCallback(() => {
    getSocket().emit('battleship:autoPlace');
  }, []);

  const fire = useCallback((targetId: string, coordinate: Coordinate) => {
    getSocket().emit('battleship:fire', { targetId, coordinate });
  }, []);

  const endTurn = useCallback(() => {
    getSocket().emit('battleship:endTurn');
  }, []);

  const useSonar = useCallback((targetId: string, topLeft: Coordinate) => {
    getSocket().emit('battleship:useSonar', { targetId, topLeft });
  }, []);

  const endGame = useCallback(() => {
    getSocket().emit('battleship:endGame');
  }, []);

  const rematch = useCallback(() => {
    getSocket().emit('battleship:rematch');
  }, []);

  return {
    gameState,
    turnTimer,
    placementTimer,
    shotResult,
    sonarResult,
    placeShips,
    autoPlace,
    fire,
    endTurn,
    useSonar,
    endGame,
    rematch,
  };
}
