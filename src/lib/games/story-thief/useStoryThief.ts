'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '@/lib/socket/client';
import type { StoryThiefClientState, VoteResult, Question } from '@/types/socket-events';

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
    });

    socket.on('story-thief:timerTick', (seconds) => {
      setTimerSeconds(seconds);
    });

    socket.on('story-thief:questionAsked', (question) => {
      setGameState(prev => ({
        ...prev,
        questions: [...prev.questions, question],
        questionCount: prev.questionCount + 1,
      }));
    });

    socket.on('story-thief:questionAnswered', (data) => {
      setGameState(prev => ({
        ...prev,
        questions: prev.questions.map(q =>
          q.id === data.questionId
            ? { ...q, answers: [...q.answers, { playerId: '', playerName: data.answeredBy, text: data.text }] }
            : q
        ),
      }));
    });

    socket.on('story-thief:voteResult', (result) => {
      setLastVoteResult(result);
    });

    return () => {
      socket.off('story-thief:stateUpdated');
      socket.off('story-thief:timerTick');
      socket.off('story-thief:questionAsked');
      socket.off('story-thief:questionAnswered');
      socket.off('story-thief:voteResult');
    };
  }, []);

  const submitStory = useCallback((text: string) => {
    getSocket().emit('story-thief:submitStory', { text });
  }, []);

  const askQuestion = useCallback((text: string) => {
    getSocket().emit('story-thief:askQuestion', { text });
  }, []);

  const answerQuestion = useCallback((questionId: string, text: string) => {
    getSocket().emit('story-thief:answerQuestion', { questionId, text });
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
    askQuestion,
    answerQuestion,
    submitVote,
    endQuestionPhase,
    submitReplacement,
    nextRound,
    endGame,
  };
}
