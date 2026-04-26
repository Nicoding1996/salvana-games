import type { Room } from '@/types/hub';
import type { StoryThiefState, Story, QuestionEntry } from '@/types/games/story-thief';
import type { StoryThiefClientState, VoteResult } from '@/types/socket-events';
import { STORY_CATEGORIES, HINT_CARDS } from '@/types/games/story-thief';

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// In-memory game states per room
const gameStates = new Map<string, StoryThiefState>();

// Track active timer intervals per room so we can clean them up
const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

export function createGame(room: Room): StoryThiefState {
  // Clean up any existing game state for this room
  cleanupGame(room.code);

  const storyPiles: Record<string, Story[]> = {};
  for (const team of room.teams) {
    storyPiles[team.id] = [];
  }

  const scores: Record<string, number> = {};
  for (const pid of Object.keys(room.players)) {
    scores[pid] = 0;
  }

  const teamScores: Record<string, number> = {};
  for (const team of room.teams) {
    teamScores[team.id] = 0;
  }

  const state: StoryThiefState = {
    phase: 'setup',
    storyPiles,
    currentStory: null,
    bluffingTeamIndex: 0,
    roundNumber: 0,
    scores,
    teamScores,
    questions: [],
    votes: {},
    submittedPlayers: new Set(),
    needsReplacement: null,
    timerEndTime: null,
    category: randomItem(STORY_CATEGORIES),
  };

  gameStates.set(room.code, state);
  return state;
}

export function getGameState(roomCode: string): StoryThiefState | undefined {
  return gameStates.get(roomCode);
}

export function submitStory(roomCode: string, playerId: string, text: string, room: Room): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state) return null;

  const player = room.players[playerId];
  if (!player || !player.teamId) return null;

  // Replacement story — only the player who needs to replace can submit
  if (state.phase === 'result' && state.needsReplacement === playerId) {
    const story: Story = { id: generateId(), text, authorId: playerId, used: false };
    state.storyPiles[player.teamId].push(story);
    state.needsReplacement = null;
    return state;
  }

  // Setup phase — initial story submission
  if (state.phase === 'setup') {
    if (state.submittedPlayers.has(playerId)) return state;

    const story: Story = { id: generateId(), text, authorId: playerId, used: false };
    state.storyPiles[player.teamId].push(story);
    state.submittedPlayers.add(playerId);
    return state;
  }

  return null;
}

export function allPlayersSubmitted(roomCode: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state) return false;
  // Only count connected players
  const connectedPlayers = Object.values(room.players).filter(p => p.connected);
  return connectedPlayers.every(p => state.submittedPlayers.has(p.id));
}

export function startRound(roomCode: string, room: Room): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state) return null;
  // Guard: only start from setup or after advancing
  if (state.phase !== 'setup' && state.currentStory !== null) return null;

  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const pile = state.storyPiles[bluffingTeam.id];
  const availableStories = pile.filter(s => !s.used);

  if (availableStories.length === 0) return null;

  const story = randomItem(availableStories);
  story.used = true;

  state.currentStory = story;
  state.phase = 'reveal';
  state.questions = [];
  state.votes = {};
  state.roundNumber++;
  state.category = randomItem(STORY_CATEGORIES);

  return state;
}

export function moveToQuestioning(roomCode: string, room: Room): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'reveal') return null;

  state.phase = 'questioning';

  if (room.settings.roundMode === 'timed') {
    state.timerEndTime = Date.now() + room.settings.timerSeconds * 1000;
  } else {
    state.timerEndTime = null;
  }

  return state;
}

export function addQuestion(roomCode: string, playerId: string, text: string, room: Room): QuestionEntry | null {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'questioning') return null;

  // Only non-bluffing team members can ask
  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const player = room.players[playerId];
  if (!player || player.teamId === bluffingTeam.id) return null;

  const question: QuestionEntry = {
    id: generateId(),
    askedBy: playerId,
    text,
    answers: [],
  };

  state.questions.push(question);
  return question;
}

export function answerQuestion(roomCode: string, questionId: string, playerId: string, text: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'questioning') return false;

  // Only bluffing team members can answer
  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const player = room.players[playerId];
  if (!player || player.teamId !== bluffingTeam.id) return false;

  const question = state.questions.find(q => q.id === questionId);
  if (!question) return false;

  if (question.answers.some(a => a.playerId === playerId)) return false;

  question.answers.push({ playerId, text });
  return true;
}

export function moveToVoting(roomCode: string): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'questioning') return null;

  state.phase = 'voting';
  state.timerEndTime = null;

  // Clear any active timer for this room
  clearRoomTimer(roomCode);

  return state;
}

export function submitVote(roomCode: string, voterId: string, suspectId: string, room: Room): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'voting') return null;

  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const voter = room.players[voterId];
  if (!voter || !voter.connected) return null;
  if (voter.teamId === bluffingTeam.id) return null;
  if (!bluffingTeam.playerIds.includes(suspectId)) return null;

  state.votes[voterId] = suspectId;
  return state;
}

/**
 * Check if all CONNECTED non-bluffing players have voted.
 * Disconnected players are skipped — the game doesn't wait for them.
 */
export function allVotesIn(roomCode: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state) return false;

  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const nonBluffingConnected = Object.values(room.players).filter(
    p => p.teamId !== bluffingTeam.id && p.connected
  );

  if (nonBluffingConnected.length === 0) return true;
  return nonBluffingConnected.every(p => state.votes[p.id] !== undefined);
}

export function calculateResults(roomCode: string, room: Room): VoteResult | null {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'voting' || !state.currentStory) return null;

  const realAuthorId = state.currentStory.authorId;
  const realAuthor = room.players[realAuthorId];
  const bluffingTeam = room.teams[state.bluffingTeamIndex];

  const teamPointsAwarded: Record<string, number> = {};
  for (const team of room.teams) {
    teamPointsAwarded[team.id] = 0;
  }

  let correctGuesses = 0;
  let totalVotes = 0;

  for (const [, suspectId] of Object.entries(state.votes)) {
    totalVotes++;
    if (suspectId === realAuthorId) {
      correctGuesses++;
    }
  }

  // Fixed 5-point pot per round
  // Majority correct → guessing teams each get 5
  // Majority wrong or tied → bluffing team gets 5
  const ROUND_POT = 5;
  const majorityCorrect = totalVotes > 0 && correctGuesses > totalVotes / 2;

  if (majorityCorrect) {
    // Each guessing team gets the full pot
    const guessingTeamIds = new Set<string>();
    for (const [voterId] of Object.entries(state.votes)) {
      const voterTeam = room.players[voterId]?.teamId;
      if (voterTeam && voterTeam !== bluffingTeam.id) {
        guessingTeamIds.add(voterTeam);
      }
    }
    for (const tid of guessingTeamIds) {
      teamPointsAwarded[tid] = ROUND_POT;
    }
  } else {
    teamPointsAwarded[bluffingTeam.id] = ROUND_POT;
  }

  // Track individual stats for end-of-game superlatives (stored in scores map)
  // scores[playerId] = number of correct guesses (for "Best Detective")
  for (const [voterId, suspectId] of Object.entries(state.votes)) {
    if (suspectId === realAuthorId) {
      state.scores[voterId] = (state.scores[voterId] || 0) + 1;
    }
  }

  // Apply team points
  for (const [tid, pts] of Object.entries(teamPointsAwarded)) {
    state.teamScores[tid] = (state.teamScores[tid] || 0) + pts;
  }

  state.phase = 'result';
  state.needsReplacement = realAuthorId;

  return {
    realAuthorId,
    realAuthorName: realAuthor?.name || 'Unknown',
    votes: { ...state.votes },
    pointsAwarded: {},
    teamPointsAwarded,
  };
}

export function submitReplacement(roomCode: string, playerId: string, text: string, room: Room): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'result') return null;
  if (state.needsReplacement !== playerId) return null;

  const player = room.players[playerId];
  if (!player || !player.teamId) return null;

  const story: Story = { id: generateId(), text, authorId: playerId, used: false };
  state.storyPiles[player.teamId].push(story);
  state.needsReplacement = null;

  return state;
}

export function advanceToNextRound(roomCode: string, room: Room): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'result') return null;

  state.bluffingTeamIndex = (state.bluffingTeamIndex + 1) % room.teams.length;
  state.currentStory = null;
  state.questions = [];
  state.votes = {};
  state.needsReplacement = null;

  return state;
}

export function getClientState(roomCode: string, playerId: string, room: Room): StoryThiefClientState | null {
  const state = gameStates.get(roomCode);
  if (!state) return null;

  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const isOnBluffingTeam = room.players[playerId]?.teamId === bluffingTeam?.id;
  const isAuthor = state.currentStory?.authorId === playerId;

  // Generate a stable hint card per player per round (not random on every call)
  const hintIndex = (playerId.charCodeAt(0) + state.roundNumber) % HINT_CARDS.length;

  return {
    phase: state.phase,
    currentStory: state.currentStory?.text || null,
    bluffingTeamId: bluffingTeam?.id || null,
    bluffingTeamMembers: bluffingTeam ? bluffingTeam.playerIds
      .filter(pid => room.players[pid])
      .map(pid => ({
        id: pid,
        name: room.players[pid].name,
        avatar: room.players[pid].avatar,
      })) : [],
    isMyStory: isAuthor,
    hintCard: (isOnBluffingTeam && !isAuthor && (state.phase === 'questioning' || state.phase === 'reveal'))
      ? HINT_CARDS[hintIndex]
      : null,
    questions: state.questions.map(q => ({
      id: q.id,
      askedBy: q.askedBy,
      askedByName: room.players[q.askedBy]?.name || 'Unknown',
      text: q.text,
      answers: q.answers.map(a => ({
        playerId: a.playerId,
        playerName: room.players[a.playerId]?.name || 'Unknown',
        text: a.text,
      })),
    })),
    questionCount: state.questions.length,
    votes: state.phase === 'result' ? state.votes : {},
    hasVoted: !!state.votes[playerId],
    hasSubmittedStory: state.submittedPlayers.has(playerId),
    needsReplacement: state.needsReplacement === playerId,
    submittedPlayers: Array.from(state.submittedPlayers),
    totalPlayers: Object.values(room.players).filter(p => p.connected).length,
    scores: { ...state.scores },
    teamScores: { ...state.teamScores },
    roundNumber: state.roundNumber,
    lastVoteResult: null,
    timerSeconds: state.timerEndTime ? Math.max(0, Math.ceil((state.timerEndTime - Date.now()) / 1000)) : null,
    storyCategory: state.category,
  };
}

export function endGame(roomCode: string): void {
  const state = gameStates.get(roomCode);
  if (state) {
    state.phase = 'finished';
  }
  clearRoomTimer(roomCode);
}

export function cleanupGame(roomCode: string): void {
  gameStates.delete(roomCode);
  clearRoomTimer(roomCode);
}

// ---- Timer management ----

export function setRoomTimer(roomCode: string, interval: ReturnType<typeof setInterval>): void {
  clearRoomTimer(roomCode); // Always clear existing first
  activeTimers.set(roomCode, interval);
}

export function clearRoomTimer(roomCode: string): void {
  const existing = activeTimers.get(roomCode);
  if (existing) {
    clearInterval(existing);
    activeTimers.delete(roomCode);
  }
}
