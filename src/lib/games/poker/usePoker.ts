// ============================================
// Poker — Client Hook (Module-Level Singleton)
// ============================================

import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { PokerClientState, ShowdownResult, PokerSuperlative } from '@/types/games/poker';

// ---- Module-level state (survives re-mounts) ----
let _state: PokerClientState | null = null;
let _showdown: ShowdownResult | null = null;
let _superlatives: PokerSuperlative[] = [];
let _turnTimer: number | null = null;
let _reactions: { playerId: string; emoji: string; timestamp: number }[] = [];
let _bound = false;
const _listeners = new Set<() => void>();

function notify() {
  for (const fn of _listeners) fn();
}

function ensureSocketBound() {
  if (_bound) return;
  _bound = true;

  const socket = getSocket();

  socket.on('poker:stateUpdated', (state: PokerClientState) => {
    _state = state;
    // Clear showdown when new hand starts
    if (state.phase === 'preflop' || state.phase === 'dealing') {
      _showdown = null;
    }
    notify();
  });

  socket.on('poker:showdown', (result: ShowdownResult) => {
    _showdown = result;
    notify();
  });

  socket.on('poker:superlatives', (superlatives: PokerSuperlative[]) => {
    _superlatives = superlatives;
    notify();
  });

  socket.on('poker:turnTimer', (secondsLeft: number) => {
    _turnTimer = secondsLeft;
    notify();
  });

  socket.on('poker:reaction', (data: { playerId: string; emoji: string }) => {
    _reactions = [..._reactions, { ...data, timestamp: Date.now() }];
    // Auto-remove after 3s
    setTimeout(() => {
      _reactions = _reactions.filter(r => Date.now() - r.timestamp < 3000);
      notify();
    }, 3000);
    notify();
  });
}

export function usePoker() {
  const [, setTick] = useState(0);

  useEffect(() => {
    ensureSocketBound();

    const listener = () => setTick(t => t + 1);
    _listeners.add(listener);

    // Immediate sync
    listener();

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  return {
    state: _state,
    showdown: _showdown,
    superlatives: _superlatives,
    turnTimer: _turnTimer,
    reactions: _reactions,

    // Actions
    fold: () => getSocket().emit('poker:action', { action: 'fold' }),
    check: () => getSocket().emit('poker:action', { action: 'check' }),
    call: () => getSocket().emit('poker:action', { action: 'call' }),
    raise: (amount: number) => getSocket().emit('poker:action', { action: 'raise', raiseAmount: amount }),
    allIn: () => getSocket().emit('poker:action', { action: 'allIn' }),
    sendReaction: (emoji: string) => getSocket().emit('poker:reaction', { emoji }),
    endGame: () => getSocket().emit('poker:endGame'),
    rematch: () => getSocket().emit('poker:rematch'),
  };
}
