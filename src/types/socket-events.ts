// ============================================
// Socket Event Types — Typed event maps
// ============================================

import type { Player, Room, RoomSettings } from './hub';
import type { StoryThiefPhase } from './games/story-thief';
import type { LiarsDiceClientState, ChallengeResult as LiarsDiceChallengeResult, LiarsDiceSettings } from './games/liars-dice';
import type { BattleshipClientState, BattleshipSettings, ShipPlacement, Coordinate, ShotEntry } from './games/battleship';
import type { PokerClientState, PokerSettings, ShowdownResult, PokerSuperlative } from './games/poker';
import type { Flip7ClientState, Flip7Settings, Card as Flip7Card } from './games/flip7';

// ---- Hub Events: Client → Server ----
export interface ClientToServerEvents {
  // Room
  'hub:createRoom': (data: { playerName: string }, callback: (res: { success: boolean; room?: Room; playerId?: string; error?: string }) => void) => void;
  'hub:joinRoom': (data: { code: string; playerName: string }, callback: (res: { success: boolean; room?: Room; playerId?: string; error?: string }) => void) => void;
  'hub:leaveRoom': () => void;
  'hub:updateSettings': (settings: Partial<RoomSettings>) => void;
  'hub:assignTeam': (data: { playerId: string; teamId: string }) => void;
  'hub:shuffleTeams': () => void;
  'hub:selectGame': (gameId: string) => void;
  'hub:startGame': (gameId: string, gameSettings?: Partial<LiarsDiceSettings> | Partial<BattleshipSettings> | Partial<PokerSettings> | Partial<Flip7Settings>) => void;
  'hub:requestState': () => void;
  'hub:kickPlayer': (data: { playerId: string }) => void;
  'hub:changeAvatar': (data: { avatar: string }) => void;

  // Story Thief
  'story-thief:submitStory': (data: { text: string }) => void;
  'story-thief:submitVote': (data: { suspectId: string }) => void;
  'story-thief:endQuestionPhase': () => void;
  'story-thief:submitReplacement': (data: { text: string }) => void;
  'story-thief:nextRound': () => void;
  'story-thief:endGame': () => void;

  // Liar's Dice
  'liars-dice:rollComplete': () => void;
  'liars-dice:placeBid': (data: { quantity: number; faceValue: number }) => void;
  'liars-dice:callLiar': () => void;
  'liars-dice:callSpotOn': () => void;
  'liars-dice:nextRound': () => void;
  'liars-dice:endGame': () => void;
  'liars-dice:rematch': () => void;

  // Battleship
  'battleship:placeShips': (data: { placements: ShipPlacement[] }) => void;
  'battleship:autoPlace': () => void;
  'battleship:fire': (data: { targetId: string; coordinate: Coordinate }) => void;
  'battleship:endTurn': () => void;
  'battleship:useSonar': (data: { targetId: string; topLeft: Coordinate }) => void;
  'battleship:endGame': () => void;
  'battleship:rematch': () => void;

  // Poker
  'poker:action': (data: { action: 'fold' | 'check' | 'call' | 'raise' | 'allIn'; raiseAmount?: number }) => void;
  'poker:reaction': (data: { emoji: string }) => void;
  'poker:endGame': () => void;
  'poker:rematch': () => void;

  // Flip 7
  'flip7:hit': () => void;
  'flip7:stay': () => void;
  'flip7:useAction': (data: { targetId: string }) => void;
  'flip7:giveModifier': (data: { targetId: string | null }) => void;
  'flip7:chaosChoice': (data: { choice: 'hit' | 'stay' }) => void;
  'flip7:nextRound': () => void;
  'flip7:endGame': () => void;
  'flip7:rematch': () => void;
}

// ---- Hub Events: Server → Client ----
export interface ServerToClientEvents {
  // Room
  'hub:roomUpdated': (room: Room) => void;
  'hub:playerJoined': (player: Player) => void;
  'hub:playerLeft': (playerId: string) => void;
  'hub:kicked': (data: { reason: string }) => void;
  'hub:error': (message: string) => void;

  // Story Thief
  'story-thief:stateUpdated': (state: StoryThiefClientState) => void;
  'story-thief:timerTick': (secondsLeft: number) => void;
  'story-thief:voteResult': (result: VoteResult) => void;

  // Liar's Dice
  'liars-dice:stateUpdated': (state: LiarsDiceClientState) => void;
  'liars-dice:diceRolled': (dice: number[]) => void;
  'liars-dice:turnTimer': (secondsLeft: number) => void;
  'liars-dice:challengeResult': (result: LiarsDiceChallengeResult) => void;

  // Battleship
  'battleship:stateUpdated': (state: BattleshipClientState) => void;
  'battleship:turnTimer': (secondsLeft: number) => void;
  'battleship:placementTimer': (secondsLeft: number) => void;
  'battleship:shotResult': (shot: ShotEntry) => void;
  'battleship:sonarResult': (data: { hasShip: boolean; topLeft: { row: number; col: number }; targetId: string }) => void;

  // Poker
  'poker:stateUpdated': (state: PokerClientState) => void;
  'poker:turnTimer': (secondsLeft: number) => void;
  'poker:showdown': (result: ShowdownResult) => void;
  'poker:reaction': (data: { playerId: string; emoji: string }) => void;
  'poker:superlatives': (superlatives: PokerSuperlative[]) => void;

  // Flip 7
  'flip7:stateUpdated': (state: Flip7ClientState) => void;
  'flip7:cardFlipped': (data: { playerId: string; playerName: string; card: Flip7Card; result: 'safe' | 'bust' | 'secondChance' }) => void;
  'flip7:turnTimer': (secondsLeft: number) => void;
  'flip7:roundEnd': (data: { scores: { playerId: string; roundScore: number; cumulativeScore: number; busted: boolean }[]; winnerId: string | null; flipSevenBy: string | null }) => void;
  'flip7:actionUsed': (data: { type: 'freeze' | 'flipThree'; byId: string; byName: string; targetId: string; targetName: string }) => void;
}

// ---- Derived types for client state ----
export interface Question {
  id: string;
  askedBy: string;
  askedByName: string;
  text: string;
  answers: { playerId: string; playerName: string; text: string }[];
}

export interface VoteResult {
  realAuthorId: string;
  realAuthorName: string;
  votes: Record<string, string>; // voterId -> suspectId
  pointsAwarded: Record<string, number>;
  teamPointsAwarded: Record<string, number>;
}

export interface StoryThiefClientState {
  phase: StoryThiefPhase;
  currentStory: string | null;
  bluffingTeamId: string | null;
  bluffingTeamMembers: { id: string; name: string; avatar: string }[];
  isMyStory: boolean;
  hintCard: string | null;
  questions: Question[];
  questionCount: number;
  votes: Record<string, string>;
  hasVoted: boolean;
  hasSubmittedStory: boolean;
  needsReplacement: boolean;
  submittedPlayers: string[];
  totalPlayers: number;
  scores: Record<string, number>;
  teamScores: Record<string, number>;
  roundNumber: number;
  lastVoteResult: VoteResult | null;
  timerSeconds: number | null;
  storyCategory: string | null;
  totalStoriesLeft: number;
  waitingForReplacement: boolean;
}
