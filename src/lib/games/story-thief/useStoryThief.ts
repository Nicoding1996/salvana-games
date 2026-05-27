'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { StoryThiefClientState, VoteResult } from '@/types/socket-events';

const initialState: StoryThiefClientState = {
  phase: 'setup',
  currentStory: null,
  bluffingTeamId: null,
  bluffingTeamMembers: [],
  isMyStory: false,
  hintCard: null,
  questions: [],
  questionCount: 0,
  votes: {},
  hasVoted: false,
  hasSubmittedStory: false,
  needsReplacement: false,
  submittedPlayers: [],
  totalPlayers: 0,
  scores: {},
  teamScores: {},
  roundNumber: 0,
  lastVoteResult: null,
  timerSeconds: null,
  storyCategory: null,
  totalStoriesLeft: 0,
  waitingForReplacement: false,
};

// Module-level state — survives component remounts
let _gameState: StoryThiefClientState = initialState;
let _timerSeconds: number | null = null;
let _lastVoteResult: VoteResult | null = null;
const _listeners = new Set<() => void>();
let _socketBound = false;

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

function resetState() {
  _gameState = initialState;
  _timerSeconds = null;
  _lastVoteResult = null;
  notifyListeners();
}

// Bind socket listeners once globally (not per component mount)
function ensureSocketBound() {
  if (_socketBound) return;
  _socketBound = true;

  const socket = getSocket();

  // Clear story-thief state when room switches away from story-thief
  socket.on('hub:roomUpdated', (room: { currentGameId?: string | null; phase?: string }) => {
    if (_gameState !== initialState && room.currentGameId !== 'story-thief') {
      resetState();
    }
  });

  socket.on('story-thief:stateUpdated', (state) => {
    _gameState = state;
    if (state.timerSeconds !== null) {
      _timerSeconds = state.timerSeconds;
    }
    // Update lastVoteResult from state (for reconnection) or clear it on phase change
    if (state.lastVoteResult) {
      _lastVoteResult = state.lastVoteResult;
    } else if (state.phase !== 'result') {
      _lastVoteResult = null;
    }
    notifyListeners();
  });

  socket.on('story-thief:timerTick', (seconds) => {
    _timerSeconds = seconds;
    notifyListeners();
  });

  socket.on('story-thief:voteResult', (result) => {
    _lastVoteResult = result;
    notifyListeners();
  });
}

export function useStoryThief() {
  const [gameState, setGameState] = useState<StoryThiefClientState>(_gameState);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(_timerSeconds);
  const [lastVoteResult, setLastVoteResult] = useState<VoteResult | null>(_lastVoteResult);

  useEffect(() => {
    ensureSocketBound();

    const listener = () => {
      setGameState(_gameState);
      setTimerSeconds(_timerSeconds);
      setLastVoteResult(_lastVoteResult);
    };
    _listeners.add(listener);

    // Sync immediately in case state changed while unmounted
    listener();

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  const submitStory = useCallback((text: string) => {
    getSocket().emit('story-thief:submitStory', { text });
  }, []);

  const submitVote = useCallback((suspectId: string) => {
    getSocket().emit('story-thief:submitVote', { suspectId });
  }, []);

  const endQuestionPhase = useCallback(() => {
    getSocket().emit('story-thief:endQuestionPhase');
  }, []);

  const submitReplacement = useCallback((text: string) => {
    getSocket().emit('story-thief:submitReplacement', { text });
  }, []);

  const nextRound = useCallback(() => {
    getSocket().emit('story-thief:nextRound');
  }, []);

  const endGame = useCallback(() => {
    getSocket().emit('story-thief:endGame');
  }, []);

  return {
    gameState,
    timerSeconds,
    lastVoteResult,
    submitStory,
    submitVote,
    endQuestionPhase,
    submitReplacement,
    nextRound,
    endGame,
  };
}
