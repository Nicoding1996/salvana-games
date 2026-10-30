'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '@/lib/socket/client';
import type {
  Flip7ActionEvent,
  Flip7ClientState,
  Flip7FlipEvent,
  Flip7PlayerInfo,
  ModifierCardKind,
} from '@/types/games/flip7';
import {
  ACTION_ANIMATION_MS,
  DEFAULT_FLIP7_SETTINGS,
  FLIP_CARD_GAP_MS,
  TOTAL_DECK_SIZE,
  chaosBatchDurationMs,
  computeRoundScore,
} from '@/types/games/flip7';

/** One animated moment: a card flip (or a chaos batch), or a Freeze / Flip Three. */
export type Flip7Reveal =
  | { kind: 'flip'; key: number; at: number; flips: Flip7FlipEvent[] }
  | { kind: 'action'; key: number; at: number; action: Flip7ActionEvent };

export interface Flip7Toast {
  key: number;
  text: string;
}

const initialState: Flip7ClientState = {
  phase: 'dealing',
  players: [],
  myCards: [],
  myModifiers: [],
  mySecondChances: 0,
  myRoundStatus: 'stayed',
  myBustChance: null,
  activePlayerId: null,
  isMyTurn: false,
  deckRemaining: TOTAL_DECK_SIZE,
  round: 1,
  settings: DEFAULT_FLIP7_SETTINGS,
  pendingAction: null,
  chaosSubmitted: [],
  roundScores: null,
  roundHistory: [],
  winnerId: null,
  activityLog: [],
  flipSevenAchievedBy: null,
};

// Reveals that waited longer than this (e.g. the phone slept mid-sequence) are
// dropped so old animations don't replay over the current table.
const STALE_REVEAL_MS = 8_000;
const TOAST_MS = 2_600;
// Safety release for the input lock if the server silently rejects an action.
const INPUT_LOCK_MS = 1_500;

// ---- Module-level state — survives component remounts ----

let _state: Flip7ClientState = initialState;
let _hasState = false;
let _timer: number | null = null;
let _queue: Flip7Reveal[] = [];
let _reveal: Flip7Reveal | null = null;
let _playing = false;      // true from the first reveal until the queue drains
let _revealGen = 0;        // bumped on clear so in-flight timeouts no-op
let _key = 0;
let _toast: Flip7Toast | null = null;
let _toastTimer: ReturnType<typeof setTimeout> | null = null;
let _lastLogTs = 0;
let _myChaosChoice: 'hit' | 'stay' | null = null;
let _inputLocked = false;
let _inputLockTimer: ReturnType<typeof setTimeout> | null = null;
const _listeners = new Set<() => void>();
let _socketBound = false;

interface Flip7Snapshot {
  state: Flip7ClientState;     // authoritative server state (use for controls)
  display: Flip7ClientState;   // same, with cards still mid-reveal hidden (use for hands)
  timer: number | null;
  reveal: Flip7Reveal | null;
  revealBusy: boolean;
  toast: Flip7Toast | null;
  myChaosChoice: 'hit' | 'stay' | null;
  inputLocked: boolean;
}

let _snapshot: Flip7Snapshot | null = null;

function getSnapshot(): Flip7Snapshot {
  if (!_snapshot) {
    _snapshot = {
      state: _state,
      display: computeDisplayState(_state),
      timer: _timer,
      reveal: _reveal,
      revealBusy: _playing,
      toast: _toast,
      myChaosChoice: _myChaosChoice,
      inputLocked: _inputLocked,
    };
  }
  return _snapshot;
}

function notify() {
  _snapshot = null;
  _listeners.forEach(fn => fn());
}

// ---- Reveal queue: one animated moment at a time ----

function revealDurationMs(r: Flip7Reveal): number {
  return r.kind === 'flip' ? chaosBatchDurationMs(r.flips) : ACTION_ANIMATION_MS;
}

function playNext() {
  const gen = _revealGen;
  let next = _queue.shift();
  while (next && Date.now() - next.at > STALE_REVEAL_MS) next = _queue.shift();
  if (!next) {
    _playing = false;
    _reveal = null;
    notify();
    return;
  }
  _playing = true;
  _reveal = next;
  notify();
  setTimeout(() => {
    if (gen !== _revealGen) return;
    _reveal = null;
    notify();
    // Short gap so consecutive cards visibly replay their entrance
    setTimeout(() => {
      if (gen === _revealGen) playNext();
    }, FLIP_CARD_GAP_MS);
  }, revealDurationMs(next));
}

function enqueue(item: Flip7Reveal) {
  _queue.push(item);
  if (!_playing) playNext();
}

function clearReveals() {
  _revealGen++;
  _queue = [];
  _reveal = null;
  _playing = false;
}

// ---- Display masking ----
// Cards still queued or mid-reveal are hidden from the table so each one lands
// in its hand exactly when its overlay finishes, instead of spoiling the reveal.

function removeEach<T>(arr: readonly T[], remove: readonly T[]): T[] {
  const out = [...arr];
  for (const r of remove) {
    const i = out.lastIndexOf(r);
    if (i !== -1) out.splice(i, 1);
  }
  return out;
}

interface Held {
  numbers: number[];
  modifiers: ModifierCardKind[];
  bust: boolean;
  savedBySecondChance: number;
  gainedSecondChance: number;
  flipSeven: boolean;
}

function heldFor(events: Flip7FlipEvent[] | undefined): Held {
  const held: Held = { numbers: [], modifiers: [], bust: false, savedBySecondChance: 0, gainedSecondChance: 0, flipSeven: false };
  for (const e of events ?? []) {
    if (e.flipSeven) held.flipSeven = true;
    if (e.result === 'bust') held.bust = true;
    else if (e.result === 'secondChance') held.savedBySecondChance++;
    else if (e.card.type === 'number') held.numbers.push(e.card.value);
    else if (e.card.type === 'modifier') held.modifiers.push(e.card.kind);
    else if (e.card.kind === 'secondChance') held.gainedSecondChance++;
  }
  return held;
}

function computeDisplayState(state: Flip7ClientState): Flip7ClientState {
  const pending = _reveal ? [_reveal, ..._queue] : _queue;
  if (pending.length === 0) return state;

  const flipsByPlayer = new Map<string, Flip7FlipEvent[]>();
  const freezesLater = new Set<string>(); // frost appears when the Freeze animation starts
  for (const r of pending) {
    if (r.kind === 'flip') {
      for (const f of r.flips) {
        const list = flipsByPlayer.get(f.playerId) ?? [];
        list.push(f);
        flipsByPlayer.set(f.playerId, list);
      }
    } else if (r.action.type === 'freeze' && r !== _reveal) {
      freezesLater.add(r.action.targetId);
    }
  }

  let anyFlipSeven = false;
  const players: Flip7PlayerInfo[] = state.players.map(p => {
    const events = flipsByPlayer.get(p.id);
    const unfreeze = freezesLater.has(p.id) && p.roundStatus === 'frozen';
    if (!events && !unfreeze) return p;
    const held = heldFor(events);
    if (held.flipSeven) anyFlipSeven = true;
    const visibleCards = removeEach(p.visibleCards, held.numbers);
    return {
      ...p,
      visibleCards,
      cardCount: visibleCards.length,
      modifiers: removeEach(p.modifiers, held.modifiers),
      hasSecondChance: held.savedBySecondChance > 0 ? true : held.gainedSecondChance > 0 ? false : p.hasSecondChance,
      roundStatus: held.bust || unfreeze ? 'active' : p.roundStatus,
      bustCard: held.bust ? null : p.bustCard,
    };
  });

  const myId = getSocket().id;
  const myEvents = myId ? flipsByPlayer.get(myId) : undefined;
  const meUnfreeze = !!myId && freezesLater.has(myId) && state.myRoundStatus === 'frozen';
  const display: Flip7ClientState = {
    ...state,
    players,
    flipSevenAchievedBy: anyFlipSeven ? null : state.flipSevenAchievedBy,
  };
  if (!myEvents && !meUnfreeze) return display;

  const held = heldFor(myEvents);
  return {
    ...display,
    myCards: state.myCards.filter(c => !held.numbers.includes(c.value)),
    myModifiers: removeEach(state.myModifiers, held.modifiers),
    mySecondChances: Math.max(0, state.mySecondChances + held.savedBySecondChance - held.gainedSecondChance),
    myRoundStatus: held.bust || meUnfreeze ? 'active' : state.myRoundStatus,
  };
}

// ---- Toasts for stays (they have no card reveal) ----

function showToast(text: string) {
  _toast = { key: ++_key, text };
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    _toast = null;
    _toastTimer = null;
    notify();
  }, TOAST_MS);
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' & ');
  return `${names.slice(0, 2).join(', ')} & ${names.length - 2} more`;
}

function toastNewStays(state: Flip7ClientState) {
  const fresh = state.activityLog.filter(e => e.timestamp > _lastLogTs);
  for (const e of state.activityLog) _lastLogTs = Math.max(_lastLogTs, e.timestamp);
  // Don't replay history when joining or reconnecting mid-round
  if (!_hasState || state.phase !== 'playing') return;

  const stays = fresh.filter(e => e.result === 'stayed');
  if (stays.length === 0) return;
  const myId = getSocket().id;
  const who = (id: string, name: string) => (id === myId ? 'You' : name);

  if (stays.length === 1) {
    const e = stays[0];
    const p = state.players.find(pl => pl.id === e.playerId);
    const banked = p ? computeRoundScore(p.visibleCards, p.modifiers, false) : 0;
    const name = who(e.playerId, e.playerName);
    showToast(e.auto
      ? `⏱️ ${name} ran out of time · banked ${banked}`
      : `🛡️ ${name} stayed · banked ${banked}`);
    return;
  }
  showToast(`🛡️ ${listNames(stays.map(e => who(e.playerId, e.playerName)))} stayed`);
}

// ---- Input lock (blocks double taps until the server answers) ----

function lockInput() {
  _inputLocked = true;
  if (_inputLockTimer) clearTimeout(_inputLockTimer);
  _inputLockTimer = setTimeout(() => {
    _inputLocked = false;
    _inputLockTimer = null;
    notify();
  }, INPUT_LOCK_MS);
  notify();
}

function unlockInput() {
  _inputLocked = false;
  if (_inputLockTimer) clearTimeout(_inputLockTimer);
  _inputLockTimer = null;
}

function resetState() {
  _state = initialState;
  _hasState = false;
  _timer = null;
  clearReveals();
  _toast = null;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = null;
  _lastLogTs = 0;
  _myChaosChoice = null;
  unlockInput();
  notify();
}

function ensureSocketBound() {
  if (_socketBound) return;
  _socketBound = true;

  const socket = getSocket();

  // Clear Flip 7 state when the room switches away from Flip 7
  socket.on('hub:roomUpdated', (room) => {
    if (_hasState && room.currentGameId !== 'flip7') resetState();
  });

  socket.on('flip7:stateUpdated', (state) => {
    // Between rounds there is nothing left to animate
    if (state.phase !== 'playing') {
      clearReveals();
      _toast = null;
    }
    toastNewStays(state);
    _state = state;
    _hasState = true;
    unlockInput();
    const myId = getSocket().id;
    if (!myId || !state.chaosSubmitted.includes(myId)) _myChaosChoice = null;
    notify();
  });

  socket.on('flip7:cardFlipped', (flip) => {
    enqueue({ kind: 'flip', key: ++_key, at: Date.now(), flips: [flip] });
  });

  socket.on('flip7:chaosFlips', (flips) => {
    if (flips.length > 0) enqueue({ kind: 'flip', key: ++_key, at: Date.now(), flips });
  });

  socket.on('flip7:actionUsed', (action) => {
    enqueue({ kind: 'action', key: ++_key, at: Date.now(), action });
  });

  socket.on('flip7:turnTimer', (secondsLeft) => {
    _timer = secondsLeft;
    notify();
  });
}

export function useFlip7() {
  const [snap, setSnap] = useState<Flip7Snapshot>(getSnapshot);

  useEffect(() => {
    ensureSocketBound();
    const listener = () => setSnap(getSnapshot());
    _listeners.add(listener);
    // Sync immediately
    listener();
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  const hit = useCallback(() => {
    if (_inputLocked) return;
    lockInput();
    getSocket().emit('flip7:hit');
  }, []);

  const stay = useCallback(() => {
    if (_inputLocked) return;
    lockInput();
    getSocket().emit('flip7:stay');
  }, []);

  const chooseTarget = useCallback((targetId: string) => {
    getSocket().emit('flip7:useAction', { targetId });
  }, []);

  const chaosChoice = useCallback((choice: 'hit' | 'stay') => {
    if (_inputLocked) return;
    _myChaosChoice = choice;
    lockInput();
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
    ...snap,
    hit,
    stay,
    chooseTarget,
    chaosChoice,
    nextRound,
    endGame,
    rematch,
  };
}
