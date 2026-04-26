import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket-events';
import type { Room } from '@/types/hub';
import * as RoomManager from './hub/RoomManager';
import * as StoryThief from './games/story-thief/StoryThiefGame';

// Guard against double-triggering setup completion
const setupLocks = new Set<string>();

export function initSocket(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ---- Hub Events ----

    socket.on('hub:createRoom', (data, callback) => {
      const name = (data.playerName || '').trim().slice(0, 20);
      if (!name) { callback({ success: false, error: 'Name is required' }); return; }
      const { room, player } = RoomManager.createRoom(socket.id, name);
      socket.join(room.code);
      callback({ success: true, room, playerId: socket.id });
      console.log(`[Room] Created ${room.code} by ${name}`);
    });

    socket.on('hub:joinRoom', (data, callback) => {
      const name = (data.playerName || '').trim().slice(0, 20);
      const code = (data.code || '').trim().toUpperCase().slice(0, 4);
      if (!name) { callback({ success: false, error: 'Name is required' }); return; }
      if (!code) { callback({ success: false, error: 'Room code is required' }); return; }
      const result = RoomManager.joinRoom(code, socket.id, name);
      if ('error' in result) {
        callback({ success: false, error: result.error });
        return;
      }

      socket.join(result.room.code);
      callback({ success: true, room: result.room, playerId: socket.id });

      if (result.reconnected) {
        // Reconnecting player — swap IDs in game state and send current state
        console.log(`[Room] ${data.playerName} reconnected to ${data.code}`);
        if (result.room.currentGameId === 'story-thief') {
          // Find the old socket ID by checking what was swapped
          // The RoomManager already swapped the ID in room.players, so we need
          // to swap it in the game state too. We stored the old ID in the result.
          StoryThief.swapPlayerId(result.room.code, result.oldId, socket.id);
          const clientState = StoryThief.getClientState(result.room.code, socket.id, result.room);
          if (clientState) {
            socket.emit('story-thief:stateUpdated', clientState);
          }
        }
      } else {
        console.log(`[Room] ${data.playerName} joined ${data.code}`);
      }

      // Notify everyone in the room
      socket.to(result.room.code).emit('hub:playerJoined', result.player);
      io.to(result.room.code).emit('hub:roomUpdated', result.room);
    });

    socket.on('hub:leaveRoom', () => {
      const result = RoomManager.leaveRoom(socket.id);
      if (result) {
        socket.leave(result.room.code);
        io.to(result.room.code).emit('hub:playerLeft', socket.id);
        io.to(result.room.code).emit('hub:roomUpdated', result.room);
      }
    });

    socket.on('hub:updateSettings', (settings) => {
      const room = RoomManager.updateSettings(socket.id, settings);
      if (room) {
        io.to(room.code).emit('hub:roomUpdated', room);
      }
    });

    socket.on('hub:assignTeam', (data) => {
      const room = RoomManager.assignTeam(socket.id, data.playerId, data.teamId);
      if (room) {
        io.to(room.code).emit('hub:roomUpdated', room);
      }
    });

    socket.on('hub:shuffleTeams', () => {
      const room = RoomManager.shuffleTeams(socket.id);
      if (room) {
        io.to(room.code).emit('hub:roomUpdated', room);
      }
    });

    socket.on('hub:startGame', (gameId) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      if (gameId === 'story-thief') {
        room.currentGameId = 'story-thief';
        room.phase = 'playing';
        StoryThief.createGame(room);

        io.to(room.code).emit('hub:roomUpdated', room);
        broadcastGameState(io, room);
        console.log(`[Game] Story Thief started in ${room.code}`);
      }
    });

    // ---- State Refresh (for mobile wake-up) ----

    socket.on('hub:requestState', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room) return;

      // Send full room state
      socket.emit('hub:roomUpdated', room);

      // Send game state if game is active
      if (room.currentGameId === 'story-thief') {
        const clientState = StoryThief.getClientState(room.code, socket.id, room);
        if (clientState) {
          socket.emit('story-thief:stateUpdated', clientState);
        }
      }
      console.log(`[Socket] State refresh for ${socket.id}`);
    });

    // ---- Story Thief Events ----

    socket.on('story-thief:submitStory', (data) => {
      const text = (data.text || '').trim().slice(0, 500);
      if (!text) return;
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room) return;

      const state = StoryThief.submitStory(room.code, socket.id, text, room);
      if (!state) return;

      broadcastGameState(io, room);

      // Check if all players submitted (setup phase) — with lock to prevent double-trigger
      if (state.phase === 'setup' && StoryThief.allPlayersSubmitted(room.code, room)) {
        if (setupLocks.has(room.code)) return; // Already processing
        setupLocks.add(room.code);

        StoryThief.startRound(room.code, room);
        broadcastGameState(io, room);

        setTimeout(() => {
          setupLocks.delete(room.code);
          const currentState = StoryThief.getGameState(room.code);
          if (currentState?.phase === 'reveal') {
            StoryThief.moveToQuestioning(room.code, room);
            broadcastGameState(io, room);

            if (room.settings.roundMode === 'timed') {
              startTimer(io, room);
            }
          }
        }, 3000);
      }
    });

    socket.on('story-thief:endQuestionPhase', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room) return;

      // Only host or bluffing team can end in free flow
      const state = StoryThief.getGameState(room.code);
      if (!state || state.phase !== 'questioning') return;

      StoryThief.moveToVoting(room.code);
      broadcastGameState(io, room);
    });

    socket.on('story-thief:submitVote', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room) return;

      StoryThief.submitVote(room.code, socket.id, data.suspectId, room);

      if (StoryThief.allVotesIn(room.code, room)) {
        const result = StoryThief.calculateResults(room.code, room);
        if (result) {
          io.to(room.code).emit('story-thief:voteResult', result);
          broadcastGameState(io, room);
        }
      } else {
        // Just update the voter's state
        const clientState = StoryThief.getClientState(room.code, socket.id, room);
        if (clientState) {
          io.to(socket.id).emit('story-thief:stateUpdated', clientState);
        }
      }
    });

    socket.on('story-thief:submitReplacement', (data) => {
      const text = (data.text || '').trim().slice(0, 500);
      if (!text) return;
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room) return;

      const state = StoryThief.submitReplacement(room.code, socket.id, data.text, room);
      if (state) {
        broadcastGameState(io, room);
      }
    });

    socket.on('story-thief:nextRound', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const state = StoryThief.getGameState(room.code);
      if (!state || state.phase !== 'result') return;

      StoryThief.advanceToNextRound(room.code, room);
      const started = StoryThief.startRound(room.code, room);
      if (!started) {
        // No stories available — notify
        io.to(room.code).emit('hub:error', 'No stories available for this team. Game ending.');
        StoryThief.endGame(room.code);
        room.phase = 'finished';
        io.to(room.code).emit('hub:roomUpdated', room);
        broadcastGameState(io, room);
        return;
      }

      broadcastGameState(io, room);

      setTimeout(() => {
        const currentState = StoryThief.getGameState(room.code);
        if (currentState?.phase === 'reveal') {
          StoryThief.moveToQuestioning(room.code, room);
          broadcastGameState(io, room);

          if (room.settings.roundMode === 'timed') {
            startTimer(io, room);
          }
        }
      }, 3000);
    });

    socket.on('story-thief:endGame', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      StoryThief.endGame(room.code);
      room.phase = 'finished';
      broadcastGameState(io, room);
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    // ---- Disconnect ----

    socket.on('disconnect', () => {
      const room = RoomManager.markDisconnected(socket.id);
      if (room) {
        io.to(room.code).emit('hub:roomUpdated', room);

        // If game is active, handle phase-specific disconnect logic
        if (room.currentGameId === 'story-thief') {
          const state = StoryThief.getGameState(room.code);

          // Voting: check if all remaining votes are in
          if (state?.phase === 'voting' && StoryThief.allVotesIn(room.code, room)) {
            const result = StoryThief.calculateResults(room.code, room);
            if (result) {
              io.to(room.code).emit('story-thief:voteResult', result);
              broadcastGameState(io, room);
            }
          }

          // Result: if the author who needs replacement disconnected, clear the requirement
          if (state?.phase === 'result' && state.needsReplacement === socket.id) {
            state.needsReplacement = null;
            broadcastGameState(io, room);
          }

          // Setup: if all remaining connected players submitted, start
          if (state?.phase === 'setup' && StoryThief.allPlayersSubmitted(room.code, room)) {
            if (!setupLocks.has(room.code)) {
              setupLocks.add(room.code);
              StoryThief.startRound(room.code, room);
              broadcastGameState(io, room);
              setTimeout(() => {
                setupLocks.delete(room.code);
                const s = StoryThief.getGameState(room.code);
                if (s?.phase === 'reveal') {
                  StoryThief.moveToQuestioning(room.code, room);
                  broadcastGameState(io, room);
                  if (room.settings.roundMode === 'timed') {
                    startTimer(io, room);
                  }
                }
              }, 3000);
            }
          }
        }
      }
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  return io;
}

function broadcastGameState(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) {
      const clientState = StoryThief.getClientState(room.code, pid, room);
      if (clientState) {
        io.to(pid).emit('story-thief:stateUpdated', clientState);
      }
    }
  }
}

function startTimer(io: SocketIOServer, room: Room): void {
  const state = StoryThief.getGameState(room.code);
  if (!state || !state.timerEndTime) return;

  const interval = setInterval(() => {
    const currentState = StoryThief.getGameState(room.code);
    if (!currentState || currentState.phase !== 'questioning' || !currentState.timerEndTime) {
      StoryThief.clearRoomTimer(room.code);
      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((currentState.timerEndTime - Date.now()) / 1000));
    io.to(room.code).emit('story-thief:timerTick', secondsLeft);

    if (secondsLeft <= 0) {
      StoryThief.clearRoomTimer(room.code);
      StoryThief.moveToVoting(room.code);
      broadcastGameState(io, room);
    }
  }, 1000);

  // Register the timer so it can be cleaned up
  StoryThief.setRoomTimer(room.code, interval);
}
