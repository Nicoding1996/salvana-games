'use client';

// ============================================
// Poker — Client Hook (Module-Level Singleton)
// ============================================
// Module state survives re-mounts and page navigation. Socket listeners are
// bound once; components subscribe through useSyncExternalStore.

import { useSyncExternalStore } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { Room } from '@/types/hub';
import type {
  PokerClientState, PokerTurnTimer, BettingAction, PokerReactionEmoji,
} from '@/types/games/poker';

export interface PokerReactionBubble {
  id: number;
  playerId: string;
  emoji: string;
}

export interface PokerStore {
  state: PokerClientState | null;
  timer: PokerTurnTimer | null;          // clock of the current active player only
  reactions: PokerReactionBubble[];      // one live bubble per player
  notice: { id: number; text: string } | null;  // e.g. a rejected action
  pending: boolean;                      // action sent, waiting for the server
  cardsShown: boolean;                   // hole cards face-up (kept across hands)
}

const REACTION_MS = 2600;
const NOTICE_MS = 2500;
const PENDING_TIMEOUT_MS = 4000;

const INITIAL: PokerStore = {
  state: null,
  timer: null,
  reactions: [],
  notice: null,
  pending: false,
  cardsShown: false,
};

let _store: PokerStore = INITIAL;
let _bound = false;
let _nextId = 1;
let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
let _noticeTimer: ReturnType<typeof setTimeout> | null = null;
const _listeners = new Set<() => void>();

function update(patch: Partial<PokerStore>): void {
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

function ensureSocketBound(): void {
  if (_bound) return;
  _bound = true;
  const socket = getSocket();

  socket.on('poker:stateUpdated', (state) => {
    const wasMyTurn = _store.state?.isMyTurn ?? false;
    if (state.isMyTurn && !wasMyTurn && typeof navigator !== 'undefined') {
      navigator.vibrate?.(40);
    }
    clearPendingTimer();
    update({
      state,
      pending: false,
      // A clock that belongs to someone no longer on the clock is stale
      timer: _store.timer && _store.timer.playerId === state.activePlayerId ? _store.timer : null,
    });
  });

  socket.on('poker:turnTimer', (timer) => {
    update({ timer });
  });

  socket.on('poker:actionRejected', (message) => {
    clearPendingTimer();
    update({ pending: false });
    showNotice(message);
  });

  socket.on('poker:reaction', ({ playerId, emoji }) => {
    const bubble: PokerReactionBubble = { id: _nextId++, playerId, emoji };
    update({ reactions: [..._store.reactions.filter(r => r.playerId !== playerId), bubble] });
    setTimeout(() => {
      update({ reactions: _store.reactions.filter(r => r.id !== bubble.id) });
    }, REACTION_MS);
  });

  // Room left poker (back to lobby or another game) — drop the table
  socket.on('hub:roomUpdated', (room: Room) => {
    if (_store.state && room.currentGameId !== 'poker') {
      clearPendingTimer();
      update({ ...INITIAL, cardsShown: _store.cardsShown });
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

function sendAction(action: BettingAction, raiseAmount?: number): void {
  if (_store.pending || !_store.state?.isMyTurn) return;
  update({ pending: true });
  getSocket().emit('poker:action', raiseAmount === undefined ? { action } : { action, raiseAmount });
  clearPendingTimer();
  // Safety net: if no answer arrives (connection drop), unlock the buttons
  _pendingTimer = setTimeout(() => update({ pending: false }), PENDING_TIMEOUT_MS);
}

const actions = {
  fold: () => sendAction('fold'),
  check: () => sendAction('check'),
  call: () => sendAction('call'),
  /** raiseTo = the total bet for this street after the raise */
  raise: (raiseTo: number) => sendAction('raise', raiseTo),
  allIn: () => sendAction('allIn'),
  sendReaction: (emoji: PokerReactionEmoji) => getSocket().emit('poker:reaction', { emoji }),
  setCardsShown: (shown: boolean) => update({ cardsShown: shown }),
  endGame: () => getSocket().emit('poker:endGame'),
  rematch: () => getSocket().emit('poker:rematch'),
};

export function usePoker() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...store, ...actions };
}
