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
};

export function useStoryThief() {
  const [gameState, setGameState] = useState<StoryThiefClientState>(initialState);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [lastVoteResult, setLastVoteResult] = useState<VoteResult | null>(null);

  useEffect(() => {
    const socket = getSocket();

    socket.on('story-thief:stateUpdated', (state) => {
      setGameState(state);
      if (state.timerSeconds !== null) {
        setTimerSeconds(state.timerSeconds);
      }
      // Reset lastVoteResult when we move past the result phase
      // so the next round doesn't show stale data
      if (state.phase !== 'result') {
        setLastVoteResult(null);
      }
    });

    socket.on('story-thief:timerTick', (seconds) => {
      setTimerSeconds(seconds);
    });

    socket.on('story-thief:voteResult', (result) => {
      setLastVoteResult(result);
    });

    return () => {
      socket.off('story-thief:stateUpdated');
      socket.off('story-thief:timerTick');
      socket.off('story-thief:voteResult');
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
