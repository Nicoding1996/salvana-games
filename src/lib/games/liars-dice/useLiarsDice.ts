'use client';

// ============================================
// Liar's Dice — Client Hook (Module-Level Singleton)
// ============================================
// Module state survives re-mounts and page navigation. Socket listeners are
// bound once; components subscribe through useSyncExternalStore.

import { useSyncExternalStore } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { Room } from '@/types/hub';
import type { BidHistoryEntry, LiarsDiceClientState, LiarsDiceTurnTimer } from '@/types/games/liars-dice';

export interface LiarsDiceNotice {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export interface LiarsDiceStore {
  state: LiarsDiceClientState | null;
  timer: LiarsDiceTurnTimer | null;     // clock of the player whose turn it is
  pending: boolean;                     // bid / call sent, waiting for the server
  notice: LiarsDiceNotice | null;       // rejected action, or a move made for someone who ran out of time
}

const PENDING_TIMEOUT_MS = 4000;
const NOTICE_MS = 3200;

const INITIAL: LiarsDiceStore = { state: null, timer: null, pending: false, notice: null };

let _store: LiarsDiceStore = INITIAL;
let _bound = false;
let _nextId = 1;
let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
let _noticeTimer: ReturnType<typeof setTimeout> | null = null;
let _seen = { round: 0, entries: 0 };   // bid history already looked at, for auto-move notices
const _listeners = new Set<() => void>();

function update(patch: Partial<LiarsDiceStore>): void {
  _store = { ..._store, ...patch };
  for (const fn of _listeners) fn();
}

function clearPendingTimer(): void {
  if (_pendingTimer) {
    clearTimeout(_pendingTimer);
    _pendingTimer = null;
  }
}

function showNotice(text: string, tone: LiarsDiceNotice['tone']): void {
  if (_noticeTimer) clearTimeout(_noticeTimer);
  const id = _nextId++;
  update({ notice: { id, text, tone } });
  _noticeTimer = setTimeout(() => {
    if (_store.notice?.id === id) update({ notice: null });
  }, NOTICE_MS);
}

function autoMoveText(entry: BidHistoryEntry): string {
  const who = entry.playerId === getSocket().id ? 'You' : entry.playerName;
  if (entry.type === 'bid') return `⏱️ ${who} ran out of time · opened with ${entry.quantity} × ${entry.faceValue}s`;
  return `⏱️ ${who} ran out of time · LIAR! called`;
}

function ensureSocketBound(): void {
  if (_bound) return;
  _bound = true;
  const socket = getSocket();

  socket.on('liars-dice:stateUpdated', (state) => {
    const prev = _store.state;

    // Moves the server made for someone who ran out of time (not replayed on reconnect)
    if (state.roundNumber !== _seen.round) _seen = { round: state.roundNumber, entries: 0 };
    if (prev) {
      const fresh = state.bidHistory.slice(_seen.entries).filter(e => e.auto);
      if (fresh.length > 0) showNotice(autoMoveText(fresh[fresh.length - 1]), 'info');
    }
    _seen.entries = state.bidHistory.length;

    if (state.isMyTurn && !prev?.isMyTurn && typeof navigator !== 'undefined') navigator.vibrate?.(40);

    clearPendingTimer();
    update({
      state,
      pending: false,
      // A clock that belongs to someone no longer on turn is stale
      timer: _store.timer && _store.timer.playerId === state.activePlayerId && state.phase === 'bidding' ? _store.timer : null,
    });
  });

  socket.on('liars-dice:turnTimer', (timer) => {
    update({ timer });
  });

  socket.on('hub:error', (message) => {
    if (!_store.state) return;
    clearPendingTimer();
    update({ pending: false });
    showNotice(message, 'error');
  });

  // Room left Liar's Dice (back to lobby or another game): drop the table
  socket.on('hub:roomUpdated', (room: Room) => {
    if (_store.state && room.currentGameId !== 'liars-dice') {
      clearPendingTimer();
      _seen = { round: 0, entries: 0 };
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

/** One move per turn: lock until the server answers (safety release if it never does). */
function sendMove(emit: () => void): void {
  if (_store.pending || !_store.state?.isMyTurn) return;
  update({ pending: true });
  emit();
  clearPendingTimer();
  _pendingTimer = setTimeout(() => update({ pending: false }), PENDING_TIMEOUT_MS);
}

const actions = {
  rollComplete: () => getSocket().emit('liars-dice:rollComplete'),
  placeBid: (quantity: number, faceValue: number) =>
    sendMove(() => getSocket().emit('liars-dice:placeBid', { quantity, faceValue })),
  callLiar: () => sendMove(() => getSocket().emit('liars-dice:callLiar')),
  callSpotOn: () => sendMove(() => getSocket().emit('liars-dice:callSpotOn')),
  endGame: () => getSocket().emit('liars-dice:endGame'),
  rematch: () => getSocket().emit('liars-dice:rematch'),
};

export function useLiarsDice() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...store, ...actions };
}
