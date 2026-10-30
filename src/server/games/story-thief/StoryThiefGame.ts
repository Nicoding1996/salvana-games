import type { Room } from '@/types/hub';
import type {
  Story,
  StoryThiefClientState,
  StoryThiefPlayerStats,
  StoryThiefState,
  StoryThiefVoteResult,
} from '@/types/games/story-thief';
import { HINT_CARDS, MIN_TEAM_SIZE, ROUND_POT, STORY_CATEGORIES } from '@/types/games/story-thief';

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function emptyStats(): StoryThiefPlayerStats {
  return { correct: 0, fooled: 0, authorFooled: 0 };
}

function statsFor(state: StoryThiefState, playerId: string): StoryThiefPlayerStats {
  if (!state.stats[playerId]) state.stats[playerId] = emptyStats();
  return state.stats[playerId];
}

/** Small stable hash, so a player's hint card survives a reconnect (new socket id). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// In-memory game states per room
const gameStates = new Map<string, StoryThiefState>();

// Questioning countdown interval per room
const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

/** Teams that can't be played (fewer than MIN_TEAM_SIZE connected players), for the start check. */
export function teamsTooSmall(room: Room): string[] {
  return room.teams
    .filter(t => t.playerIds.filter(pid => room.players[pid]?.connected).length < MIN_TEAM_SIZE)
    .map(t => t.name);
}

export function createGame(room: Room): StoryThiefState {
  cleanupGame(room.code);

  const storyPiles: Record<string, Story[]> = {};
  const teamScores: Record<string, number> = {};
  for (const team of room.teams) {
    storyPiles[team.id] = [];
    teamScores[team.id] = 0;
  }

  const stats: Record<string, StoryThiefPlayerStats> = {};
  for (const pid of Object.keys(room.players)) stats[pid] = emptyStats();

  const state: StoryThiefState = {
    phase: 'setup',
    storyPiles,
    currentStory: null,
    bluffingTeamIndex: 0,
    roundNumber: 0,
    teamScores,
    stats,
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

function swapInSet(set: Set<string>, oldId: string, newId: string): void {
  if (set.delete(oldId)) set.add(newId);
}

function swapInVotes(votes: Record<string, string>, oldId: string, newId: string): void {
  if (votes[oldId] !== undefined) {
    votes[newId] = votes[oldId];
    delete votes[oldId];
  }
  for (const [voterId, suspectId] of Object.entries(votes)) {
    if (suspectId === oldId) votes[voterId] = newId;
  }
}

/**
 * Swap a player's old socket ID for a new one in all game state references.
 * Called when a player reconnects with a new socket ID.
 */
export function swapPlayerId(roomCode: string, oldId: string, newId: string): void {
  const state = gameStates.get(roomCode);
  if (!state) return;

  swapInSet(state.submittedPlayers, oldId, newId);
  swapInSet(state.pendingReplacements, oldId, newId);

  if (state.stats[oldId]) {
    state.stats[newId] = state.stats[oldId];
    delete state.stats[oldId];
  }

  swapInVotes(state.votes, oldId, newId);

  for (const pile of Object.values(state.storyPiles)) {
    for (const story of pile) {
      if (story.authorId === oldId) story.authorId = newId;
    }
  }
  // currentStory is one of the pile objects, so it's already updated

  const result = state.lastVoteResult;
  if (result) {
    if (result.realAuthorId === oldId) result.realAuthorId = newId;
    swapInVotes(result.votes, oldId, newId);
  }
}

/** A setup story, or the story a player owes between rounds. */
export function submitStory(roomCode: string, playerId: string, text: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state || state.phase === 'finished') return false;

  const teamId = room.players[playerId]?.teamId;
  if (!teamId || !state.storyPiles[teamId]) return false;

  const owesStory = state.pendingReplacements.has(playerId);
  const setupStory = state.phase === 'setup' && !state.submittedPlayers.has(playerId);
  if (!owesStory && !setupStory) return false;

  state.storyPiles[teamId].push({ id: generateId(), text, authorId: playerId, used: false });
  if (owesStory) state.pendingReplacements.delete(playerId);
  if (state.phase === 'setup') state.submittedPlayers.add(playerId);
  return true;
}

/** Setup is done once every connected player has written a story. */
export function allPlayersSubmitted(roomCode: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state) return false;
  const connected = Object.values(room.players).filter(p => p.connected);
  return connected.length > 0 && connected.every(p => state.submittedPlayers.has(p.id));
}

/** Between rounds with no story pulled yet: waiting for an owed story (or for players to come back). */
export function isWaitingForStory(roomCode: string): boolean {
  const state = gameStates.get(roomCode);
  return !!state && state.phase === 'result' && state.currentStory === null;
}

export type RoundStart = 'started' | 'waiting' | 'unavailable';

/**
 * Pull the next story. Starting from the scheduled bluffing team, a team is skipped if
 * none of its players are connected or nobody else is around to guess. Every connected
 * bluffer must have an unused story in the pile, otherwise the guessers could rule out
 * whoever is missing one. Anyone without a story is asked for one and the round waits.
 */
export function startRound(roomCode: string, room: Room): RoundStart {
  const state = gameStates.get(roomCode);
  if (!state) return 'unavailable';
  const fromSetup = state.phase === 'setup';
  const betweenRounds = state.phase === 'result' && state.currentStory === null;
  if (!fromSetup && !betweenRounds) return 'unavailable';

  for (let i = 0; i < room.teams.length; i++) {
    const index = (state.bluffingTeamIndex + i) % room.teams.length;
    const team = room.teams[index];
    const bluffers = team.playerIds.filter(pid => room.players[pid]?.connected);
    const hasGuessers = Object.values(room.players).some(p => p.connected && p.teamId !== team.id);
    if (bluffers.length === 0 || !hasGuessers) continue;

    state.bluffingTeamIndex = index;
    const pile = state.storyPiles[team.id] ?? [];
    const missing = bluffers.filter(pid => !pile.some(s => !s.used && s.authorId === pid));
    if (missing.length > 0) {
      for (const pid of missing) state.pendingReplacements.add(pid);
      state.phase = 'result';
      state.currentStory = null;
      return 'waiting';
    }

    const story = randomItem(pile.filter(s => !s.used && bluffers.includes(s.authorId)));
    story.used = true;
    state.currentStory = story;
    state.phase = 'reveal';
    state.votes = {};
    state.timerEndTime = null;
    state.roundNumber++;
    state.category = randomItem(STORY_CATEGORIES);
    return 'started';
  }

  // Nobody can play right now (e.g. a whole team's phones are asleep): wait between rounds
  state.phase = 'result';
  state.currentStory = null;
  return 'waiting';
}

export function moveToQuestioning(roomCode: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'reveal') return false;

  state.phase = 'questioning';
  state.timerEndTime = room.settings.roundMode === 'timed'
    ? Date.now() + room.settings.timerSeconds * 1000
    : null;
  return true;
}

/** Host can always end questioning; in free flow, so can anyone who is guessing. */
export function canEndQuestions(roomCode: string, room: Room, playerId: string): boolean {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'questioning') return false;
  if (room.hostId === playerId) return true;
  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const player = room.players[playerId];
  return room.settings.roundMode === 'freeFlow' && !!player && player.teamId !== bluffingTeam?.id;
}

export function moveToVoting(roomCode: string): boolean {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'questioning') return false;

  state.phase = 'voting';
  state.timerEndTime = null;
  clearRoomTimer(roomCode);
  return true;
}

export function submitVote(roomCode: string, voterId: string, suspectId: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'voting') return false;

  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const voter = room.players[voterId];
  if (!bluffingTeam || !voter || !voter.connected) return false;
  if (voter.teamId === bluffingTeam.id) return false;
  if (!bluffingTeam.playerIds.includes(suspectId)) return false;
  if (state.votes[voterId] !== undefined) return false; // votes are final

  state.votes[voterId] = suspectId;
  return true;
}

/** Guessers who count for this vote: everyone off the bluffing team who is connected or already voted. */
function voterIds(state: StoryThiefState, room: Room): string[] {
  const bluffingTeamId = room.teams[state.bluffingTeamIndex]?.id;
  return Object.values(room.players)
    .filter(p => p.teamId !== bluffingTeamId && (p.connected || state.votes[p.id] !== undefined))
    .map(p => p.id);
}

/** Every connected guesser has voted. Disconnected players don't hold the vote up. */
export function allVotesIn(roomCode: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state) return false;
  return voterIds(state, room).every(id => state.votes[id] !== undefined);
}

export function voteCount(roomCode: string): number {
  return Object.keys(gameStates.get(roomCode)?.votes ?? {}).length;
}

/**
 * Score the vote. Majority of guessers right → each guessing team that voted gets the pot.
 * Majority wrong, tied, or nobody voted → the bluffing team gets it.
 */
export function calculateResults(roomCode: string, room: Room): StoryThiefVoteResult | null {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'voting' || !state.currentStory) return null;

  const realAuthorId = state.currentStory.authorId;
  const bluffingTeam = room.teams[state.bluffingTeamIndex];

  const teamPointsAwarded: Record<string, number> = {};
  for (const team of room.teams) teamPointsAwarded[team.id] = 0;

  const votes = Object.entries(state.votes);
  const correctVotes = votes.filter(([, suspectId]) => suspectId === realAuthorId).length;
  const guessersWon = votes.length > 0 && correctVotes > votes.length / 2;

  if (guessersWon) {
    for (const [voterId] of votes) {
      const teamId = room.players[voterId]?.teamId;
      if (teamId && teamId !== bluffingTeam.id) teamPointsAwarded[teamId] = ROUND_POT;
    }
  } else {
    teamPointsAwarded[bluffingTeam.id] = ROUND_POT;
  }

  for (const [voterId, suspectId] of votes) {
    if (suspectId === realAuthorId) {
      statsFor(state, voterId).correct++;
    } else {
      statsFor(state, suspectId).fooled++;
      statsFor(state, realAuthorId).authorFooled++;
    }
  }

  for (const [teamId, pts] of Object.entries(teamPointsAwarded)) {
    state.teamScores[teamId] = (state.teamScores[teamId] || 0) + pts;
  }

  state.phase = 'result';
  // The author's story is spent: they write a new one before their team bluffs again
  state.pendingReplacements.add(realAuthorId);

  const result: StoryThiefVoteResult = {
    realAuthorId,
    realAuthorName: room.players[realAuthorId]?.name || 'Unknown',
    bluffingTeamId: bluffingTeam.id,
    story: state.currentStory.text,
    votes: { ...state.votes },
    correctVotes,
    totalVotes: votes.length,
    guessersWon,
    teamPointsAwarded,
  };
  state.lastVoteResult = result;
  return result;
}

/** Host moves on from the result screen: the next team is up. */
export function advanceToNextRound(roomCode: string, room: Room): boolean {
  const state = gameStates.get(roomCode);
  if (!state || state.phase !== 'result' || state.currentStory === null) return false;

  state.bluffingTeamIndex = (state.bluffingTeamIndex + 1) % room.teams.length;
  state.currentStory = null;
  state.votes = {};
  return true;
}

export function getClientState(roomCode: string, playerId: string, room: Room): StoryThiefClientState | null {
  const state = gameStates.get(roomCode);
  if (!state) return null;

  const bluffingTeam = room.teams[state.bluffingTeamIndex];
  const me = room.players[playerId];
  const isOnBluffingTeam = !!me && me.teamId === bluffingTeam?.id;
  const isAuthor = state.currentStory?.authorId === playerId;
  const inRound = state.phase === 'reveal' || state.phase === 'questioning';
  const waiting = state.phase === 'result' && state.currentStory === null;
  const voters = state.phase === 'voting' ? voterIds(state, room) : [];

  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    storyCategory: state.category,
    hasSubmittedStory: state.submittedPlayers.has(playerId),
    submittedPlayers: Array.from(state.submittedPlayers),
    currentStory: state.currentStory?.text ?? null,
    bluffingTeamId: bluffingTeam?.id ?? null,
    bluffingTeamMembers: (bluffingTeam?.playerIds ?? [])
      .filter(pid => room.players[pid])
      .map(pid => ({
        id: pid,
        name: room.players[pid].name,
        avatar: room.players[pid].avatar,
        connected: room.players[pid].connected,
      })),
    isMyStory: isAuthor,
    hintCard: isOnBluffingTeam && !isAuthor && inRound && me
      ? HINT_CARDS[(hashString(me.name) + state.roundNumber) % HINT_CARDS.length]
      : null,
    timerSeconds: state.timerEndTime ? Math.max(0, Math.ceil((state.timerEndTime - Date.now()) / 1000)) : null,
    hasVoted: state.votes[playerId] !== undefined,
    myVote: state.votes[playerId] ?? null,
    votedCount: voters.filter(id => state.votes[id] !== undefined).length,
    voterCount: voters.length,
    needsReplacement: state.pendingReplacements.has(playerId),
    waitingForReplacement: waiting,
    waitingOn: waiting && bluffingTeam
      ? bluffingTeam.playerIds.filter(pid => room.players[pid]?.connected && state.pendingReplacements.has(pid))
      : [],
    teamScores: { ...state.teamScores },
    stats: { ...state.stats },
    lastVoteResult: state.phase === 'result' ? state.lastVoteResult : null,
  };
}

/** Game over: show the summary. State stays until the host goes back to the lobby. */
export function endGame(roomCode: string): void {
  const state = gameStates.get(roomCode);
  if (state) state.phase = 'finished';
  clearRoomTimer(roomCode);
}

export function cleanupGame(roomCode: string): void {
  gameStates.delete(roomCode);
  clearRoomTimer(roomCode);
}

// ---- Timer management ----

export function setRoomTimer(roomCode: string, interval: ReturnType<typeof setInterval>): void {
  clearRoomTimer(roomCode);
  activeTimers.set(roomCode, interval);
}

export function clearRoomTimer(roomCode: string): void {
  const existing = activeTimers.get(roomCode);
  if (existing) {
    clearInterval(existing);
    activeTimers.delete(roomCode);
  }
}
