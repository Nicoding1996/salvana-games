'use client';

// ============================================
// Read the Room — Client Hook (Module-Level Singleton)
// ============================================
// Two stores: the game (state, timer, pending action, notice) and the shared dial.
// The dial gets its own store so a drag re-renders only the dial, not the whole screen.
// Socket listeners are bound once; components subscribe through useSyncExternalStore.

import { useSyncExternalStore } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { Room } from '@/types/hub';
import type { ReadTheRoomClientState, ReadTheRoomDial, ReadTheRoomSide, ReadTheRoomTimer } from '@/types/games/read-the-room';
import { RTR_MOVE_SEND_MS, RTR_NEEDLE_START } from '@/types/games/read-the-room';

export interface ReadTheRoomNotice {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export interface ReadTheRoomStore {
  state: ReadTheRoomClientState | null;
  timer: ReadTheRoomTimer | null;
  pending: 'clue' | 'lock' | 'call' | null;   // the button waiting for the server
  notice: ReadTheRoomNotice | null;            // a rejected action
}

const PENDING_TIMEOUT_MS = 4000;
const NOTICE_MS = 3200;

const INITIAL: ReadTheRoomStore = { state: null, timer: null, pending: null, notice: null };
const INITIAL_DIAL: ReadTheRoomDial = { position: RTR_NEEDLE_START, holderId: null };

let _store: ReadTheRoomStore = INITIAL;
let _dial: ReadTheRoomDial = INITIAL_DIAL;
let _dragging = false;                 // this phone is moving the dial
let _bound = false;
let _nextId = 1;
let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
let _noticeTimer: ReturnType<typeof setTimeout> | null = null;
let _lastSentAt = 0;
let _trailing: ReturnType<typeof setTimeout> | null = null;
let _trailingPosition: number | null = null;
const _listeners = new Set<() => void>();
const _dialListeners = new Set<() => void>();

function update(patch: Partial<ReadTheRoomStore>): void {
  _store = { ..._store, ...patch };
  for (const fn of _listeners) fn();
}

function setDial(dial: ReadTheRoomDial): void {
  if (dial.position === _dial.position && dial.holderId === _dial.holderId) return;
  _dial = dial;
  for (const fn of _dialListeners) fn();
}

function myId(): string | null {
  return getSocket().id ?? null;
}

function clearPendingTimer(): void {
  if (_pendingTimer) {
    clearTimeout(_pendingTimer);
    _pendingTimer = null;
  }
}

function cancelTrailingMove(): void {
  if (_trailing) {
    clearTimeout(_trailing);
    _trailing = null;
  }
  _trailingPosition = null;
}

function stopDrag(): void {
  _dragging = false;
  cancelTrailingMove();
}

function showNotice(text: string, tone: ReadTheRoomNotice['tone']): void {
  if (_noticeTimer) clearTimeout(_noticeTimer);
  const id = _nextId++;
  update({ notice: { id, text, tone } });
  _noticeTimer = setTimeout(() => {
    if (_store.notice?.id === id) update({ notice: null });
  }, NOTICE_MS);
}

function ensureSocketBound(): void {
  if (_bound) return;
  _bound = true;
  const socket = getSocket();

  socket.on('read-the-room:stateUpdated', (state) => {
    const prev = _store.state;
    const me = myId();
    if (state.phase !== 'guess') stopDrag();

    // Your turn to give the clue: a short buzz, like the other games' "your turn"
    const newClueGiver = state.phase === 'clue' && state.clueGiverId === me
      && (prev?.clueGiverId !== me || prev?.roundNumber !== state.roundNumber || prev?.phase !== 'clue');
    if (newClueGiver && typeof navigator !== 'undefined') navigator.vibrate?.(40);

    clearPendingTimer();
    update({ state, pending: null, timer: state.timer });

    // While this phone drags, its own position wins over an older one from the server,
    // unless the server says someone else holds the dial
    if (_dragging) {
      if (state.dial.holderId === null || state.dial.holderId === me) return;
      stopDrag();
    }
    setDial(state.dial);
  });

  socket.on('read-the-room:dial', (dial) => {
    if (_dragging) {
      // An echo of this phone's own drag, or someone letting go while this phone drags: keep ours
      if (dial.holderId === null || dial.holderId === myId()) return;
      // Someone else got the dial first
      stopDrag();
    }
    setDial(dial);
  });

  socket.on('read-the-room:timer', (timer) => {
    update({ timer });
  });

  socket.on('hub:error', (message) => {
    if (!_store.state) return;
    clearPendingTimer();
    update({ pending: null });
    showNotice(message, 'error');
  });

  // Room left Read the Room (back to lobby or another game): drop everything
  socket.on('hub:roomUpdated', (room: Room) => {
    if (_store.state && room.currentGameId !== 'read-the-room') {
      clearPendingTimer();
      stopDrag();
      update(INITIAL);
      setDial(INITIAL_DIAL);
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

function subscribeDial(listener: () => void): () => void {
  ensureSocketBound();
  _dialListeners.add(listener);
  return () => {
    _dialListeners.delete(listener);
  };
}

const getSnapshot = () => _store;
const getServerSnapshot = () => INITIAL;
const getDialSnapshot = () => _dial;
const getDialServerSnapshot = () => INITIAL_DIAL;
const getHolderSnapshot = () => _dial.holderId;
const getHolderServerSnapshot = () => null;

/** One action at a time: lock the button until the server answers (safety release if it never does). */
function sendOnce(kind: NonNullable<ReadTheRoomStore['pending']>, emit: () => void): void {
  if (_store.pending) return;
  update({ pending: kind });
  emit();
  clearPendingTimer();
  _pendingTimer = setTimeout(() => update({ pending: null }), PENDING_TIMEOUT_MS);
}

function flushMove(): void {
  _trailing = null;
  if (_trailingPosition === null) return;
  const position = _trailingPosition;
  _trailingPosition = null;
  _lastSentAt = Date.now();
  getSocket().emit('read-the-room:dialMove', { position });
}

const actions = {
  giveClue: (pairId: number, clue: string) =>
    sendOnce('clue', () => getSocket().emit('read-the-room:giveClue', { pairId, clue })),
  lockIn: () => sendOnce('lock', () => getSocket().emit('read-the-room:lockIn')),
  lockCall: () => sendOnce('call', () => getSocket().emit('read-the-room:lockCall')),
  pickCall: (side: ReadTheRoomSide) => getSocket().emit('read-the-room:pickCall', { side }),

  /** The needle follows the finger at once; the server hears about it at most every 66 ms. */
  moveDial: (position: number) => {
    _dragging = true;
    setDial({ position, holderId: myId() });
    _trailingPosition = position;
    const wait = RTR_MOVE_SEND_MS - (Date.now() - _lastSentAt);
    if (wait <= 0) {
      if (_trailing) clearTimeout(_trailing);
      flushMove();
    } else if (!_trailing) {
      _trailing = setTimeout(flushMove, wait);
    }
  },

  /** Let go: the final position goes out straight away. */
  releaseDial: (position: number) => {
    const holding = _dragging && _dial.holderId !== null && _dial.holderId === myId();
    stopDrag();
    if (!holding) return;
    setDial({ position, holderId: null });
    getSocket().emit('read-the-room:dialRelease', { position });
  },

  skipClueGiver: () => getSocket().emit('read-the-room:skipClueGiver'),
  nextRound: () => getSocket().emit('read-the-room:nextRound'),
  endGame: () => getSocket().emit('read-the-room:endGame'),
  rematch: () => getSocket().emit('read-the-room:rematch'),
};

export type ReadTheRoomActions = typeof actions;

export function useReadTheRoom() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...store, ...actions };
}

/** The shared dial on its own: only the components that draw it re-render while it moves. */
export function useReadTheRoomDial(): ReadTheRoomDial {
  return useSyncExternalStore(subscribeDial, getDialSnapshot, getDialServerSnapshot);
}

/** Just who holds the dial: re-renders when the holder changes, not on every move. */
export function useReadTheRoomDialHolder(): string | null {
  return useSyncExternalStore(subscribeDial, getHolderSnapshot, getHolderServerSnapshot);
}
