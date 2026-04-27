import type { Room } from '@/types/hub';
import type { StoryThiefState, Story } from '@/types/games/story-thief';
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
    pendingReplacements: new Set(),
    timerEndTime: null,
    category: randomItem(STORY_CATEGORIES),
    lastVoteResult: null,
  };

  gameStates.set(room.code, state);
  return state;
}

export function getGameState(roomCode: string): StoryThiefState | undefined {
  return gameStates.get(roomCode);
}

/**
 * Swap a player's old socket ID for a new one in all game state references.
 * Called when a player reconnects with a new socket ID.
 */
export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = gameStates.get(roomCode);
  if (!state) return;

  // submittedPlayers Set
  if (state.submittedPlayers.has(oldId)) {
    state.submittedPlayers.delete(oldId);
    state.submittedPlayers.add(newId);
  }

  // scores
  if (state.scores[oldId] !== undefined) {
    state.scores[newId] = state.scores[oldId];
    delete state.scores[oldId];
  }

  // votes (as voter)
  if (state.votes[oldId] !== undefined) {
    state.votes[newId] = state.votes[oldId];
    delete state.votes[oldId];
  }

  // votes (as suspect — update values pointing to old ID)
  for (const [voterId, suspectId] of Object.entries(state.votes)) {
    if (suspectId === oldId) {
      state.votes[voterId] = newId;
    }
  }

  // pendingReplacements
  if (state.pendingReplacements.has(oldId)) {
    state.pendingReplacements.delete(oldId);
    state.pendingReplacements.add(newId);
  }

  // currentStory author
  if (state.currentStory && state.currentStory.authorId === oldId) {
    state.currentStory.authorId = newId;
  }

  // Story piles — update authorId in all stories
  for (const pile of Object.values(state.storyPiles)) {
    for (const story of pile) {
      if (story.authorId === oldId) {
        story.authorId = newId;
      }
    }
  }

  // Questions — update askedBy and answer playerIds
  for (const q of state.questions) {
    if (q.askedBy === oldId) q.askedBy = newId;
    for (const a of q.answers) {
      if (a.playerId === oldId) a.playerId = newId;
    }
  }
}

export function submitStory(roomCode: string, playerId: string, text: string, room: Room): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state) return null;

  const player = room.players[playerId];
  if (!player || !player.teamId) return null;

  // Pending replacement — can be submitted during any phase
  if (state.pendingReplacements.has(playerId)) {
    const story: Story = { id: generateId(), text, authorId: playerId, used: false };
    state.storyPiles[player.teamId].push(story);
    state.pendingReplacements.delete(playerId);
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

  // Every connected player on the bluffing team must have an unused story in the pile.
  // Otherwise the other team can deduce who didn't write — ruins the bluffing.
  const connectedBluffers = bluffingTeam.playerIds.filter(pid => room.players[pid]?.connected);
  for (const pid of connectedBluffers) {
    const hasStory = availableStories.some(s => s.authorId === pid);
    if (!hasStory) return null;
  }

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

/**
 * Check if the bluffing team can't start because a player owes a replacement.
 * Returns true if any connected bluffing team member is missing a story but has a pending replacement.
 */
export function isWaitingOnReplacement(roomCode: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state) return false;

  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const pile = state.storyPiles[bluffingTeam.id];
  const availableStories = pile.filter(s => !s.used);

  const connectedBluffers = bluffingTeam.playerIds.filter(pid => room.players[pid]?.connected);

  for (const pid of connectedBluffers) {
    const hasStory = availableStories.some(s => s.authorId === pid);
    if (!hasStory) {
      // This player is missing a story — are they writing one?
      if (state.pendingReplacements.has(pid)) {
        return true; // Yes, waiting on them
      }
      // No pending replacement and no story — this is a permanent gap (e.g. disconnect cleared it)
      // Don't return true — let it fall through to the "truly no stories" end-game path
    }
  }

  return false;
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
  state.pendingReplacements.add(realAuthorId);

  const voteResult: VoteResult = {
    realAuthorId,
    realAuthorName: realAuthor?.name || 'Unknown',
    votes: { ...state.votes },
    pointsAwarded: {},
    teamPointsAwarded,
  };

  state.lastVoteResult = voteResult;
  return voteResult;
}

export function submitReplacement(roomCode: string, playerId: string, text: string, room: Room): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state) return null;
  if (!state.pendingReplacements.has(playerId)) return null;

  const player = room.players[playerId];
  if (!player || !player.teamId) return null;

  const story: Story = { id: generateId(), text, authorId: playerId, used: false };
  state.storyPiles[player.teamId].push(story);
  state.pendingReplacements.delete(playerId);

  return state;
}

export function advanceToNextRound(roomCode: string, room: Room): StoryThiefState | null {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'result') return null;

  state.bluffingTeamIndex = (state.bluffingTeamIndex + 1) % room.teams.length;
  state.currentStory = null;
  state.questions = [];
  state.votes = {};

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
    needsReplacement: state.pendingReplacements.has(playerId),
    submittedPlayers: Array.from(state.submittedPlayers),
    totalPlayers: Object.values(room.players).filter(p => p.connected).length,
    scores: { ...state.scores },
    teamScores: { ...state.teamScores },
    roundNumber: state.roundNumber,
    lastVoteResult: state.phase === 'result' ? state.lastVoteResult : null,
    timerSeconds: state.timerEndTime ? Math.max(0, Math.ceil((state.timerEndTime - Date.now()) / 1000)) : null,
    storyCategory: state.category,
    totalStoriesLeft: Object.values(state.storyPiles)
      .reduce((sum, pile) => sum + pile.filter(s => !s.used).length, 0),
    waitingForReplacement: state.phase === 'result' && state.currentStory === null,
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
