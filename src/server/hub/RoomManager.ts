import type { Room, Player, RoomSettings, Team } from '@/types/hub';
import { DEFAULT_SETTINGS, TEAM_CONFIGS, AVATARS } from '@/types/hub';

const rooms = new Map<string, Room>();
const playerRoomMap = new Map<string, string>(); // socketId -> roomCode
// Track when each player disconnected (socketId -> timestamp)
const disconnectTimestamps = new Map<string, number>();
// How long to keep disconnected players before auto-removing (5 minutes)
const DISCONNECT_CLEANUP_MS = 5 * 60 * 1000;

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function getAvailableAvatar(room: Room): string {
  const usedAvatars = Object.values(room.players).map(p => p.avatar);
  const available = AVATARS.filter(a => !usedAvatars.includes(a));
  return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : AVATARS[0];
}

export function createRoom(hostSocketId: string, playerName: string): { room: Room; player: Player } {
  const code = generateCode();

  const teams: Team[] = Array.from({ length: DEFAULT_SETTINGS.teamCount }, (_, i) => ({
    id: `team-${i}`,
    name: TEAM_CONFIGS[i].name,
    color: TEAM_CONFIGS[i].color,
    playerIds: [],
  }));

  const room: Room = {
    code,
    hostId: hostSocketId,
    players: {},
    teams,
    settings: { ...DEFAULT_SETTINGS },
    currentGameId: null,
    selectedGameId: 'story-thief',
    phase: 'lobby',
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  const player: Player = {
    id: hostSocketId,
    name: playerName,
    teamId: null,
    isHost: true,
    connected: true,
    avatar: getAvailableAvatar(room),
  };

  room.players[hostSocketId] = player;
  rooms.set(code, room);
  playerRoomMap.set(hostSocketId, code);

  // Auto-assign host to first team
  autoAssignTeam(room, hostSocketId);

  return { room, player };
}

/**
 * Join a room. If a player with the same name already exists and is disconnected,
 * reconnect them with the new socket ID instead of creating a duplicate.
 */
export function joinRoom(code: string, socketId: string, playerName: string): { room: Room; player: Player; reconnected: boolean; oldId: string } | { error: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: 'Room not found' };

  // Check if this is a reconnecting player (same name, disconnected)
  const existingPlayer = Object.values(room.players).find(
    p => p.name === playerName && !p.connected
  );

  if (existingPlayer) {
    // Reconnect: swap old socket ID for new one
    const oldId = existingPlayer.id;

    // Clear disconnect timestamp since they're back
    disconnectTimestamps.delete(oldId);

    delete room.players[oldId];
    playerRoomMap.delete(oldId);

    existingPlayer.id = socketId;
    existingPlayer.connected = true;
    room.players[socketId] = existingPlayer;
    playerRoomMap.set(socketId, code.toUpperCase());

    // Update team playerIds
    for (const team of room.teams) {
      const idx = team.playerIds.indexOf(oldId);
      if (idx !== -1) {
        team.playerIds[idx] = socketId;
      }
    }

    // If they were host, update host ID
    if (room.hostId === oldId) {
      room.hostId = socketId;
    }

    room.lastActivity = Date.now();
    console.log(`[Room] ${playerName} reconnected to ${code} (${oldId} → ${socketId})`);
    return { room, player: existingPlayer, reconnected: true, oldId };
  }

  // New player joining
  if (room.phase !== 'lobby') return { error: 'Game already in progress' };
  if (Object.keys(room.players).length >= room.settings.maxPlayers) return { error: 'Room is full' };

  // Reject duplicate names — prevents session hijacking on reconnect
  const nameConflict = Object.values(room.players).find(
    p => p.name === playerName && p.connected
  );
  if (nameConflict) return { error: 'Name already taken in this room' };

  const player: Player = {
    id: socketId,
    name: playerName,
    teamId: null,
    isHost: false,
    connected: true,
    avatar: getAvailableAvatar(room),
  };

  room.players[socketId] = player;
  room.lastActivity = Date.now();
  playerRoomMap.set(socketId, code.toUpperCase());

  autoAssignTeam(room, socketId);

  return { room, player, reconnected: false, oldId: '' };
}

export function leaveRoom(socketId: string): { room: Room; wasHost: boolean } | null {
  const code = playerRoomMap.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  const wasHost = room.hostId === socketId;
  const player = room.players[socketId];

  // Remove from team
  if (player?.teamId) {
    const team = room.teams.find(t => t.id === player.teamId);
    if (team) {
      team.playerIds = team.playerIds.filter(id => id !== socketId);
    }
  }

  delete room.players[socketId];
  playerRoomMap.delete(socketId);
  disconnectTimestamps.delete(socketId); // Clean up in case they were marked disconnected

  // Transfer host
  if (wasHost) {
    const remaining = Object.keys(room.players).filter(id => room.players[id].connected);
    if (remaining.length > 0) {
      room.hostId = remaining[0];
      room.players[remaining[0]].isHost = true;
    } else {
      rooms.delete(code);
      return null;
    }
  }

  room.lastActivity = Date.now();
  return { room, wasHost };
}

/**
 * Mark a player as disconnected (don't remove them — they might reconnect).
 * If the host disconnects, transfer host to another connected player.
 * 
 * Race condition guard: if the player already reconnected with a new socket ID
 * (old disconnect event arriving late), the old socket ID won't be in the room
 * anymore, so we safely return null.
 */
export function markDisconnected(socketId: string): Room | null {
  const code = playerRoomMap.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  const player = room.players[socketId];
  if (!player) return null; // Player already swapped out (reconnected with new ID)

  // Race condition guard: if the player is already marked connected under this ID,
  // but another socket with the same name is also connected, skip — they reconnected
  // and this is a stale disconnect from the old socket.
  if (!player.connected) return null; // Already marked disconnected

  player.connected = false;

  // Record disconnect timestamp for zombie cleanup
  disconnectTimestamps.set(socketId, Date.now());

  // Transfer host if the disconnected player was host
  if (room.hostId === socketId) {
    const connectedPlayers = Object.values(room.players).filter(p => p.connected);
    if (connectedPlayers.length > 0) {
      // Old host loses host status
      player.isHost = false;
      // New host
      const newHost = connectedPlayers[0];
      room.hostId = newHost.id;
      newHost.isHost = true;
      console.log(`[Room] Host transferred from ${player.name} to ${newHost.name} in ${room.code}`);
    }
  }

  room.lastActivity = Date.now();
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function getRoomByPlayer(socketId: string): Room | undefined {
  const code = playerRoomMap.get(socketId);
  return code ? rooms.get(code) : undefined;
}

export function getConnectedPlayerCount(room: Room): number {
  return Object.values(room.players).filter(p => p.connected).length;
}

export function updateSettings(socketId: string, settings: Partial<RoomSettings>): Room | null {
  const room = getRoomByPlayer(socketId);
  if (!room || room.hostId !== socketId) return null;

  if (settings.teamCount && settings.teamCount !== room.settings.teamCount) {
    const newCount = settings.teamCount;
    while (room.teams.length < newCount) {
      const i = room.teams.length;
      room.teams.push({
        id: `team-${i}`,
        name: TEAM_CONFIGS[i].name,
        color: TEAM_CONFIGS[i].color,
        playerIds: [],
      });
    }
    while (room.teams.length > newCount) {
      const removed = room.teams.pop()!;
      for (const pid of removed.playerIds) {
        if (room.players[pid]) {
          room.players[pid].teamId = null;
          autoAssignTeam(room, pid);
        }
      }
    }
  }

  Object.assign(room.settings, settings);
  room.lastActivity = Date.now();
  return room;
}

export function assignTeam(socketId: string, playerId: string, teamId: string): Room | null {
  const room = getRoomByPlayer(socketId);
  if (!room) return null;

  // Allow self-assignment (any player can switch their own team)
  // or host can assign anyone
  if (socketId !== playerId && room.hostId !== socketId) return null;

  // Only allow team changes in lobby
  if (room.phase !== 'lobby') return null;

  const player = room.players[playerId];
  if (!player) return null;

  if (player.teamId) {
    const oldTeam = room.teams.find(t => t.id === player.teamId);
    if (oldTeam) {
      oldTeam.playerIds = oldTeam.playerIds.filter(id => id !== playerId);
    }
  }

  const newTeam = room.teams.find(t => t.id === teamId);
  if (!newTeam) return null;

  newTeam.playerIds.push(playerId);
  player.teamId = teamId;
  room.lastActivity = Date.now();

  return room;
}

export function shuffleTeams(socketId: string): Room | null {
  const room = getRoomByPlayer(socketId);
  if (!room || room.hostId !== socketId) return null;
  if (room.phase !== 'lobby') return null;

  // Clear all teams
  for (const team of room.teams) {
    team.playerIds = [];
  }
  for (const player of Object.values(room.players)) {
    player.teamId = null;
  }

  // Shuffle player IDs
  const playerIds = Object.keys(room.players);
  for (let i = playerIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
  }

  // Round-robin assign to teams
  for (let i = 0; i < playerIds.length; i++) {
    const teamIndex = i % room.teams.length;
    const team = room.teams[teamIndex];
    team.playerIds.push(playerIds[i]);
    room.players[playerIds[i]].teamId = team.id;
  }

  room.lastActivity = Date.now();
  return room;
}

function autoAssignTeam(room: Room, playerId: string): void {
  const smallest = room.teams.reduce((min, team) =>
    team.playerIds.length < min.playerIds.length ? team : min
  );

  smallest.playerIds.push(playerId);
  room.players[playerId].teamId = smallest.id;
}

/**
 * Remove a disconnected player from a room entirely.
 * Used by zombie cleanup to free up player slots.
 * Returns the room code and player info for game-state cleanup.
 */
export function removeDisconnectedPlayer(socketId: string): { roomCode: string; room: Room; player: Player } | null {
  const code = playerRoomMap.get(socketId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  const player = room.players[socketId];
  if (!player || player.connected) return null; // Don't remove connected players

  // Remove from team
  if (player.teamId) {
    const team = room.teams.find(t => t.id === player.teamId);
    if (team) {
      team.playerIds = team.playerIds.filter(id => id !== socketId);
    }
  }

  delete room.players[socketId];
  playerRoomMap.delete(socketId);
  disconnectTimestamps.delete(socketId);

  // If this was somehow still the host (shouldn't happen, but defensive), transfer
  if (room.hostId === socketId) {
    const remaining = Object.values(room.players).filter(p => p.connected);
    if (remaining.length > 0) {
      room.hostId = remaining[0].id;
      remaining[0].isHost = true;
    } else {
      // Check if there are any players at all (even disconnected)
      const anyPlayers = Object.keys(room.players);
      if (anyPlayers.length === 0) {
        rooms.delete(code);
        return null;
      }
    }
  }

  room.lastActivity = Date.now();
  console.log(`[Room] Zombie cleanup: removed ${player.name} from ${code}`);
  return { roomCode: code, room, player };
}

/**
 * Get all disconnected players that have exceeded the cleanup timeout.
 * Returns socket IDs that should be removed.
 */
export function getZombiePlayers(): string[] {
  const now = Date.now();
  const zombies: string[] = [];
  for (const [socketId, timestamp] of disconnectTimestamps) {
    if (now - timestamp > DISCONNECT_CLEANUP_MS) {
      zombies.push(socketId);
    }
  }
  return zombies;
}

// Cleanup stale rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > TWO_HOURS) {
      // Clean up all player references
      for (const pid of Object.keys(room.players)) {
        playerRoomMap.delete(pid);
        disconnectTimestamps.delete(pid);
      }
      rooms.delete(code);
      console.log(`[Room] Stale room cleanup: deleted ${code}`);
    }
  }
}, 10 * 60 * 1000);
