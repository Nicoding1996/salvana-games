// ============================================
// Whose Truth? (story-thief) — Shared game types & constants
// ============================================

export type StoryThiefPhase =
  | 'setup'          // everyone writes their first story
  | 'reveal'         // a story is pulled from the bluffing team's pile
  | 'questioning'    // guessers ask questions out loud
  | 'voting'         // guessers vote on the real author
  | 'result'         // author revealed and points awarded; also "between rounds, waiting for a story"
  | 'finished';      // game over

export interface Story {
  id: string;
  text: string;
  authorId: string;
  used: boolean;
}

/** Per-player tallies for the end-of-game awards. */
export interface StoryThiefPlayerStats {
  correct: number;       // correct guesses (Best Detective)
  fooled: number;        // wrong votes attracted while bluffing someone else's story (Master Bluffer)
  authorFooled: number;  // wrong votes on their own story (Poker Face)
}

export interface StoryThiefVoteResult {
  realAuthorId: string;
  realAuthorName: string;
  bluffingTeamId: string;
  story: string;
  votes: Record<string, string>;            // voterId → suspectId
  correctVotes: number;
  totalVotes: number;
  guessersWon: boolean;                     // majority of guessers picked the real author
  teamPointsAwarded: Record<string, number>;
}

// ---- Server state (authoritative, never sent as-is) ----

export interface StoryThiefState {
  phase: StoryThiefPhase;
  storyPiles: Record<string, Story[]>;      // teamId → stories
  currentStory: Story | null;
  bluffingTeamIndex: number;
  roundNumber: number;
  teamScores: Record<string, number>;
  stats: Record<string, StoryThiefPlayerStats>;
  votes: Record<string, string>;
  submittedPlayers: Set<string>;            // wrote their setup story
  pendingReplacements: Set<string>;         // owe a story (their last one was used, or they missed setup)
  timerEndTime: number | null;
  category: string | null;
  lastVoteResult: StoryThiefVoteResult | null;
}

// ---- Client state (personalized per player) ----

export interface StoryThiefMember {
  id: string;
  name: string;
  avatar: string;
  connected: boolean;
}

export interface StoryThiefClientState {
  phase: StoryThiefPhase;
  roundNumber: number;
  storyCategory: string | null;             // writing prompt suggestion
  // Setup
  hasSubmittedStory: boolean;
  submittedPlayers: string[];
  // Current round
  currentStory: string | null;
  bluffingTeamId: string | null;
  bluffingTeamMembers: StoryThiefMember[];
  isMyStory: boolean;
  hintCard: string | null;                  // bluffers only
  timerSeconds: number | null;              // questioning countdown (timed mode)
  // Voting
  hasVoted: boolean;
  myVote: string | null;
  votedCount: number;
  voterCount: number;
  // Stories owed between rounds
  needsReplacement: boolean;                // I owe a story
  waitingForReplacement: boolean;           // the next round is waiting for a story (or for players)
  waitingOn: string[];                      // ids of connected players the next round waits for
  // Scores
  teamScores: Record<string, number>;
  stats: Record<string, StoryThiefPlayerStats>;
  lastVoteResult: StoryThiefVoteResult | null;
}

// ---- Constants ----

/** Points for the winning side of each round. */
export const ROUND_POT = 5;
/** Longest story the server accepts. */
export const MAX_STORY_LENGTH = 500;
/** Every team needs at least this many connected players to start. */
export const MIN_TEAM_SIZE = 2;
/** How long the pulled story is shown before questioning starts. */
export const STORY_REVEAL_MS = 3000;

export const STORY_CATEGORIES = [
  'An embarrassing moment',
  'A childhood memory',
  'Something nobody here knows about you',
  'A travel adventure',
  'A time you got in trouble',
  'Your most unusual talent or habit',
  'A funny misunderstanding',
  'A moment that changed your perspective',
  'Something you did for the first time',
  'A memorable encounter with a stranger',
];

export const HINT_CARDS = [
  'Think of a similar experience from your own life',
  'Focus on the emotions — how would YOU have felt?',
  'Add a small specific detail to make it believable',
  'Think about where this might have happened to you',
  'Consider who else might have been there',
  'What age were you when something like this could happen?',
  'Think of a time you felt the same way',
  'Add a sensory detail — what did you see, hear, smell?',
];

/** Conversation starters shown to guessers during questioning. */
export const QUESTION_IDEAS = [
  'How old were you?',
  'Where exactly did it happen?',
  'Who else was there?',
  'What happened right after?',
  'How did you feel in the moment?',
  'Who have you told this story to?',
  'What were you wearing?',
  'What time of year was it?',
  'What would you do differently?',
  'What did you say out loud?',
];
