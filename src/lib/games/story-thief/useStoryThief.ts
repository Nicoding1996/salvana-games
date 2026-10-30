'use client';

// ============================================
// Whose Truth? — Client Hook (Module-Level Singleton)
// ============================================
// Module state survives re-mounts and page navigation. Socket listeners are
// bound once; components subscribe through useSyncExternalStore.

import { useSyncExternalStore } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { Room } from '@/types/hub';
import type { StoryThiefClientState, StoryThiefPhase } from '@/types/games/story-thief';

export interface StoryThiefNotice {
  id: number;
  text: string;
}

export interface StoryThiefStore {
  state: StoryThiefClientState | null;
  timer: number | null;                 // questioning countdown, timed mode only
  sending: 'story' | 'vote' | null;     // sent, waiting for the server to answer
  notice: StoryThiefNotice | null;      // server error shown as a toast
}

const PENDING_TIMEOUT_MS = 5000;
const NOTICE_MS = 3000;

const INITIAL: StoryThiefStore = { state: null, timer: null, sending: null, notice: null };

let _store: StoryThiefStore = INITIAL;
let _bound = false;
let _nextId = 1;
let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
let _noticeTimer: ReturnType<typeof setTimeout> | null = null;
const _listeners = new Set<() => void>();

function update(patch: Partial<StoryThiefStore>): void {
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

// Phases worth a little buzz when they start
const BUZZ_PHASES: StoryThiefPhase[] = ['reveal', 'voting', 'result'];

function ensureSocketBound(): void {
  if (_bound) return;
  _bound = true;
  const socket = getSocket();

  socket.on('story-thief:stateUpdated', (state) => {
    const prevPhase = _store.state?.phase;
    if (prevPhase && prevPhase !== state.phase && BUZZ_PHASES.includes(state.phase) && typeof navigator !== 'undefined') {
      navigator.vibrate?.(35);
    }
    clearPendingTimer();
    update({
      state,
      sending: null,
      timer: state.phase === 'questioning' ? state.timerSeconds : null,
    });
  });

  socket.on('story-thief:timerTick', (secondsLeft) => {
    if (_store.state?.phase === 'questioning') update({ timer: secondsLeft });
  });

  socket.on('hub:error', (message) => {
    if (_store.state) showNotice(message);
  });

  // Room left Whose Truth? (back to the lobby or another game): drop the game
  socket.on('hub:roomUpdated', (room: Room) => {
    if (_store.state && room.currentGameId !== 'story-thief') {
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

/** Send once and lock until the server answers (safety release if it never does). */
function sendOnce(kind: 'story' | 'vote', emit: () => void): void {
  if (_store.sending) return;
  update({ sending: kind });
  emit();
  clearPendingTimer();
  _pendingTimer = setTimeout(() => update({ sending: null }), PENDING_TIMEOUT_MS);
}

const actions = {
  /** Setup story, or the story owed between rounds */
  submitStory: (text: string) => sendOnce('story', () => getSocket().emit('story-thief:submitStory', { text })),
  submitVote: (suspectId: string) => sendOnce('vote', () => getSocket().emit('story-thief:submitVote', { suspectId })),
  endQuestionPhase: () => getSocket().emit('story-thief:endQuestionPhase'),
  forceReveal: () => getSocket().emit('story-thief:forceReveal'),
  nextRound: () => getSocket().emit('story-thief:nextRound'),
  endGame: () => getSocket().emit('story-thief:endGame'),
};

export function useStoryThief() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...store, ...actions };
}
