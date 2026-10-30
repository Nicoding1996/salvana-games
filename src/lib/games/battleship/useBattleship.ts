'use client';

// ============================================
// Battleship — Client Hook (Module-Level Singleton)
// ============================================
// Module state survives re-mounts and page navigation. Socket listeners are
// bound once; components subscribe through useSyncExternalStore.

import { useSyncExternalStore } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { Room } from '@/types/hub';
import type {
  BattleshipClientState,
  BattleshipTimer,
  Coordinate,
  ShipPlacement,
  ShotEntry,
} from '@/types/games/battleship';

export interface BattleshipShotFx {
  key: number;
  shot: ShotEntry;
}

export interface BattleshipStore {
  state: BattleshipClientState | null;
  timer: BattleshipTimer | null;        // turn clock, or the placement clock (playerId null)
  lastShot: BattleshipShotFx | null;    // newest shot, for the impact animation and the feed line
  pending: string | null;               // 'fleet', 'sonar' or "targetId:row,col": sent, waiting for the server
  notice: { id: number; text: string } | null;
}

const PENDING_TIMEOUT_MS = 4000;
const NOTICE_MS = 3000;

const INITIAL: BattleshipStore = { state: null, timer: null, lastShot: null, pending: null, notice: null };

let _store: BattleshipStore = INITIAL;
let _bound = false;
let _nextId = 1;
let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
let _noticeTimer: ReturnType<typeof setTimeout> | null = null;
const _listeners = new Set<() => void>();

function update(patch: Partial<BattleshipStore>): void {
  _store = { ..._store, ...patch };
  for (const fn of _listeners) fn();
}

function clearPendingTimer(): void {
  if (_pendingTimer) {
    clearTimeout(_pendingTimer);
    _pendingTimer = null;
  }
}

function showNotice(text: string): void {
  if (_noticeTimer) clearTimeout(_noticeTimer);
  const id = _nextId++;
  update({ notice: { id, text } });
  _noticeTimer = setTimeout(() => {
    if (_store.notice?.id === id) update({ notice: null });
  }, NOTICE_MS);
}

function buzz(shot: ShotEntry): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  const myId = getSocket().id;
  if (shot.playerId === myId) {
    navigator.vibrate(shot.result === 'sunk' ? [80, 40, 80, 40, 150] : shot.result === 'hit' ? 90 : 25);
  } else if (shot.targetId === myId && shot.result !== 'miss') {
    navigator.vibrate([60, 30, 60]);
  }
}

function ensureSocketBound(): void {
  if (_bound) return;
  _bound = true;
  const socket = getSocket();

  socket.on('battleship:stateUpdated', (state) => {
    const wasMyTurn = _store.state?.isMyTurn ?? false;
    if (state.isMyTurn && !wasMyTurn && typeof navigator !== 'undefined') navigator.vibrate?.(40);
    clearPendingTimer();
    const timer = _store.timer;
    const timerStillValid = !!timer && (timer.playerId === null
      ? state.phase === 'placement'
      : state.phase === 'battle' && timer.playerId === state.activePlayerId);
    update({ state, pending: null, timer: timerStillValid ? timer : null });
  });

  socket.on('battleship:turnTimer', (timer) => {
    update({ timer });
  });

  socket.on('battleship:shotResult', (shot) => {
    buzz(shot);
    update({ lastShot: { key: _nextId++, shot } });
  });

  socket.on('hub:error', (message) => {
    if (!_store.state) return;
    clearPendingTimer();
    update({ pending: null });
    showNotice(message);
  });

  // Room left Battleship (back to lobby or another game): drop the game
  socket.on('hub:roomUpdated', (room: Room) => {
    if (_store.state && room.currentGameId !== 'battleship') {
      clearPendingTimer();
      update(INITIAL);
    }
  });
}

function subscribe(listener: () => void): () => void {
  ensureSocketBound();
  _listeners.add(listener);
  // State may have been broadcast before we were listening
  if (!_store.state) getSocket().emit('hub:requestState');
  return () => {
    _listeners.delete(listener);
  };
}

const getSnapshot = () => _store;
const getServerSnapshot = () => INITIAL;

/** One request at a time: lock until the server answers (safety release if it never does). */
function sendOnce(key: string, emit: () => void): void {
  if (_store.pending) return;
  update({ pending: key });
  emit();
  clearPendingTimer();
  _pendingTimer = setTimeout(() => update({ pending: null }), PENDING_TIMEOUT_MS);
}

export function cellKey(targetId: string, c: Coordinate): string {
  return `${targetId}:${c.row},${c.col}`;
}

const actions = {
  placeShips: (placements: ShipPlacement[]) =>
    sendOnce('fleet', () => getSocket().emit('battleship:placeShips', { placements })),
  fire: (targetId: string, coordinate: Coordinate) =>
    sendOnce(cellKey(targetId, coordinate), () => getSocket().emit('battleship:fire', { targetId, coordinate })),
  sonarPing: (targetId: string, topLeft: Coordinate) =>
    sendOnce('sonar', () => getSocket().emit('battleship:sonarPing', { targetId, topLeft })),
  endGame: () => getSocket().emit('battleship:endGame'),
  rematch: () => getSocket().emit('battleship:rematch'),
};

export function useBattleship() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...store, ...actions };
}
