// ============================================
// Socket Event Types — Typed event maps
// ============================================

import type { Player, Room, RoomSettings } from './hub';
import type { StoryThiefClientState } from './games/story-thief';
import type { LiarsDiceClientState, LiarsDiceSettings, LiarsDiceTurnTimer } from './games/liars-dice';
import type { BattleshipClientState, BattleshipSettings, BattleshipTimer, ShipPlacement, Coordinate, ShotEntry } from './games/battleship';
import type { PokerClientState, PokerSettings, PokerTurnTimer, BettingAction } from './games/poker';
import type { Flip7ClientState, Flip7Settings, Flip7FlipEvent, Flip7ActionEvent } from './games/flip7';

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

  // Whose Truth? (story-thief)
  'story-thief:submitStory': (data: { text: string }) => void;  // setup story, or a story owed between rounds
  'story-thief:submitVote': (data: { suspectId: string }) => void;
  'story-thief:endQuestionPhase': () => void;
  'story-thief:forceReveal': () => void;                         // host: reveal with the votes that are in
  'story-thief:nextRound': () => void;
  'story-thief:endGame': () => void;

  // Liar's Dice
  'liars-dice:rollComplete': () => void;
  'liars-dice:placeBid': (data: { quantity: number; faceValue: number }) => void;
  'liars-dice:callLiar': () => void;
  'liars-dice:callSpotOn': () => void;
  'liars-dice:endGame': () => void;
  'liars-dice:rematch': () => void;

  // Battleship
  'battleship:placeShips': (data: { placements: ShipPlacement[] }) => void;
  'battleship:fire': (data: { targetId: string; coordinate: Coordinate }) => void;
  'battleship:sonarPing': (data: { targetId: string; topLeft: Coordinate }) => void;
  'battleship:endGame': () => void;
  'battleship:rematch': () => void;

  // Poker
  'poker:action': (data: { action: BettingAction; raiseAmount?: number }) => void;  // raiseAmount = "raise to" total
  'poker:reaction': (data: { emoji: string }) => void;
  'poker:endGame': () => void;
  'poker:rematch': () => void;

  // Flip 7
  'flip7:hit': () => void;
  'flip7:stay': () => void;
  'flip7:useAction': (data: { targetId: string }) => void;
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

  // Whose Truth? (story-thief)
  'story-thief:stateUpdated': (state: StoryThiefClientState) => void;
  'story-thief:timerTick': (secondsLeft: number) => void;

  // Liar's Dice
  'liars-dice:stateUpdated': (state: LiarsDiceClientState) => void;
  'liars-dice:turnTimer': (timer: LiarsDiceTurnTimer | null) => void;  // null = no clock running

  // Battleship
  'battleship:stateUpdated': (state: BattleshipClientState) => void;
  'battleship:turnTimer': (timer: BattleshipTimer | null) => void;  // turn or placement clock, null = none running
  'battleship:shotResult': (shot: ShotEntry) => void;

  // Poker
  'poker:stateUpdated': (state: PokerClientState) => void;
  'poker:turnTimer': (timer: PokerTurnTimer | null) => void;  // null = no clock running
  'poker:actionRejected': (message: string) => void;
  'poker:reaction': (data: { playerId: string; emoji: string }) => void;

  // Flip 7
  'flip7:stateUpdated': (state: Flip7ClientState) => void;
  'flip7:cardFlipped': (data: Flip7FlipEvent) => void;
  'flip7:chaosFlips': (flips: Flip7FlipEvent[]) => void;
  'flip7:turnTimer': (secondsLeft: number | null) => void;  // null = no countdown running
  'flip7:actionUsed': (data: Flip7ActionEvent) => void;
}
