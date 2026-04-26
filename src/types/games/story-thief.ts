// ============================================
// Story Thief — Shared game types
// ============================================

export type StoryThiefPhase =
  | 'setup'          // Players writing initial stories
  | 'reveal'         // Story drawn and displayed
  | 'questioning'    // Teams asking questions
  | 'voting'         // Non-bluffing teams voting
  | 'result'         // Author revealed, points shown
  | 'replacement'    // Author writing replacement story
  | 'finished';      // Game over

export interface Story {
  id: string;
  text: string;
  authorId: string;
  used: boolean;
}

export interface StoryThiefState {
  phase: StoryThiefPhase;
  storyPiles: Record<string, Story[]>;
  currentStory: Story | null;
  bluffingTeamIndex: number;
  roundNumber: number;
  scores: Record<string, number>;
  teamScores: Record<string, number>;
  questions: QuestionEntry[];
  votes: Record<string, string>;
  submittedPlayers: Set<string>;
  needsReplacement: string | null;
  timerEndTime: number | null;
  category: string | null;
  lastVoteResult: import('@/types/socket-events').VoteResult | null;
}

export interface QuestionEntry {
  id: string;
  askedBy: string;
  text: string;
  answers: { playerId: string; text: string }[];
}

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
