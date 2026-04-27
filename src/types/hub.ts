// ============================================
// Hub Types — Shared between client and server
// ============================================

export interface Player {
  id: string;          // socket.id
  name: string;
  teamId: string | null;
  isHost: boolean;
  connected: boolean;
  avatar: string;      // emoji avatar
}

export interface Team {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
}

export type RoundMode = 'timed' | 'freeFlow';

export interface RoomSettings {
  maxPlayers: number;
  teamCount: 2 | 3;
  roundMode: RoundMode;
  timerSeconds: number;
}

export interface Room {
  code: string;
  hostId: string;
  players: Record<string, Player>;
  teams: Team[];
  settings: RoomSettings;
  currentGameId: string | null;
  selectedGameId: string | null;  // host's game selection in lobby (before starting)
  phase: RoomPhase;
  createdAt: number;
  lastActivity: number;
}

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 18,
  teamCount: 2,
  roundMode: 'timed',
  timerSeconds: 90,
};

export const TEAM_CONFIGS: { name: string; color: string }[] = [
  { name: 'Team Red', color: '#EF4444' },
  { name: 'Team Blue', color: '#3B82F6' },
  { name: 'Team Green', color: '#22C55E' },
];

export const AVATARS = [
  '😎', '🤠', '👻', '🦊', '🐸', '🦄', '🐙', '🎃',
  '🤖', '👽', '🦁', '🐯', '🐻', '🐼', '🐨', '🐵',
  '🦋', '🌸',
];
