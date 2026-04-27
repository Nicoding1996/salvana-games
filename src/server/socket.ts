import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket-events';
import type { Room } from '@/types/hub';
import * as RoomManager from './hub/RoomManager';
import * as StoryThief from './games/story-thief/StoryThiefGame';
import * as LiarsDice from './games/liars-dice/LiarsDiceGame';

// Guard against double-triggering setup completion
const setupLocks = new Set<string>();
// Grace period timers for disconnected players in Liar's Dice
const disconnectGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Zombie cleanup interval reference
let zombieCleanupInterval: ReturnType<typeof setInterval> | null = null;

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
          StoryThief.swapPlayerId(result.room.code, result.oldId, socket.id);
          const clientState = StoryThief.getClientState(result.room.code, socket.id, result.room);
          if (clientState) {
            socket.emit('story-thief:stateUpdated', clientState);
          }
        }
        if (result.room.currentGameId === 'liars-dice') {
          LiarsDice.swapPlayerId(result.room.code, result.oldId, socket.id);
          const clientState = LiarsDice.getClientState(result.room.code, socket.id, result.room);
          if (clientState) {
            socket.emit('liars-dice:stateUpdated', clientState);
          }
          // Clear any disconnect grace timer for this player
          const graceKey = `${result.room.code}:${result.oldId}`;
          const graceTimer = disconnectGraceTimers.get(graceKey);
          if (graceTimer) {
            clearTimeout(graceTimer);
            disconnectGraceTimers.delete(graceKey);
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

    socket.on('hub:selectGame', (gameId) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (room.phase !== 'lobby') return;
      room.selectedGameId = gameId;
      room.lastActivity = Date.now();
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    socket.on('hub:startGame', (gameId, gameSettings) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      if (gameId === 'story-thief') {
        room.currentGameId = 'story-thief';
        room.selectedGameId = 'story-thief';
        room.phase = 'playing';
        StoryThief.createGame(room);

        io.to(room.code).emit('hub:roomUpdated', room);
        broadcastStoryThiefState(io, room);
        console.log(`[Game] Story Thief started in ${room.code}`);
      }

      if (gameId === 'liars-dice') {
        room.currentGameId = 'liars-dice';
        room.selectedGameId = 'liars-dice';
        room.phase = 'playing';
        LiarsDice.createGame(room, gameSettings);

        io.to(room.code).emit('hub:roomUpdated', room);
        broadcastLiarsDiceState(io, room);

        // Send each player their dice
        sendDiceToPlayers(io, room);

        // Auto-advance from rolling to bidding after 5s (fallback for shake)
        setTimeout(() => {
          const state = LiarsDice.getGameState(room.code);
          if (state?.phase === 'rolling') {
            LiarsDice.startBidding(room.code);
            broadcastLiarsDiceState(io, room);
            startLiarsDiceTurnTimer(io, room);
          }
        }, 5000);

        console.log(`[Game] Liar's Dice started in ${room.code}`);
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
      if (room.currentGameId === 'liars-dice') {
        const clientState = LiarsDice.getClientState(room.code, socket.id, room);
        if (clientState) {
          socket.emit('liars-dice:stateUpdated', clientState);
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

      broadcastStoryThiefState(io, room);

      // Check if all players submitted (setup phase) — with lock to prevent double-trigger
      if (state.phase === 'setup' && StoryThief.allPlayersSubmitted(room.code, room)) {
        if (setupLocks.has(room.code)) return; // Already processing
        setupLocks.add(room.code);

        StoryThief.startRound(room.code, room);
        broadcastStoryThiefState(io, room);

        setTimeout(() => {
          setupLocks.delete(room.code);
          const currentState = StoryThief.getGameState(room.code);
          if (currentState?.phase === 'reveal') {
            StoryThief.moveToQuestioning(room.code, room);
            broadcastStoryThiefState(io, room);

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
      broadcastStoryThiefState(io, room);
    });

    socket.on('story-thief:submitVote', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room) return;

      StoryThief.submitVote(room.code, socket.id, data.suspectId, room);

      if (StoryThief.allVotesIn(room.code, room)) {
        const result = StoryThief.calculateResults(room.code, room);
        if (result) {
          io.to(room.code).emit('story-thief:voteResult', result);
          broadcastStoryThiefState(io, room);
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

      // Replacements can be submitted during any phase now
      const state = StoryThief.submitReplacement(room.code, socket.id, text, room);
      if (state) {
        broadcastStoryThiefState(io, room);

        // If the game was waiting for this replacement to start the next round, auto-start it
        if (state.currentStory === null && state.phase === 'result') {
          const started = StoryThief.startRound(room.code, room);
          if (started) {
            broadcastStoryThiefState(io, room);

            setTimeout(() => {
              const currentState = StoryThief.getGameState(room.code);
              if (currentState?.phase === 'reveal') {
                StoryThief.moveToQuestioning(room.code, room);
                broadcastStoryThiefState(io, room);

                if (room.settings.roundMode === 'timed') {
                  startTimer(io, room);
                }
              }
            }, 3000);
          }
        }
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
        // Check if we're waiting on a pending replacement for this team
        if (StoryThief.isWaitingOnReplacement(room.code, room)) {
          // Don't end the game — broadcast state so players see the waiting state
          // The floating replacement banner will prompt the author to write
          broadcastStoryThiefState(io, room);
          return;
        }
        // Truly no stories left — end game gracefully
        io.to(room.code).emit('hub:error', 'All stories have been used! Game over.');
        StoryThief.endGame(room.code);
        room.phase = 'finished';
        io.to(room.code).emit('hub:roomUpdated', room);
        broadcastStoryThiefState(io, room);
        return;
      }

      broadcastStoryThiefState(io, room);

      setTimeout(() => {
        const currentState = StoryThief.getGameState(room.code);
        if (currentState?.phase === 'reveal') {
          StoryThief.moveToQuestioning(room.code, room);
          broadcastStoryThiefState(io, room);

          if (room.settings.roundMode === 'timed') {
            startTimer(io, room);
          }
        }
      }, 3000);
    });

    socket.on('story-thief:endGame', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      // If game is already finished (GameSummary screen), go back to lobby
      const state = StoryThief.getGameState(room.code);
      if (!state || state.phase === 'finished') {
        StoryThief.endGame(room.code);
        room.phase = 'lobby';
        room.currentGameId = null;
        // Keep selectedGameId so lobby remembers the last game played
        io.to(room.code).emit('hub:roomUpdated', room);
        return;
      }

      // Mid-game end: show finished screen first
      StoryThief.endGame(room.code);
      room.phase = 'finished';
      broadcastStoryThiefState(io, room);
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    // ---- Liar's Dice Events ----

    socket.on('liars-dice:rollComplete', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'liars-dice') return;

      LiarsDice.markRollComplete(room.code, socket.id);

      if (LiarsDice.allRollsComplete(room.code, room)) {
        LiarsDice.startBidding(room.code);
        broadcastLiarsDiceState(io, room);
        startLiarsDiceTurnTimer(io, room);
      }
    });

    socket.on('liars-dice:placeBid', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'liars-dice') return;

      const result = LiarsDice.placeBid(room.code, socket.id, data.quantity, data.faceValue, room);
      if (!result.success) {
        socket.emit('hub:error', result.error || 'Invalid bid');
        return;
      }

      // Reset turn timer for next player
      LiarsDice.clearRoomTimer(room.code);
      broadcastLiarsDiceState(io, room);
      startLiarsDiceTurnTimer(io, room);
    });

    socket.on('liars-dice:callLiar', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'liars-dice') return;

      LiarsDice.clearRoomTimer(room.code);
      const result = LiarsDice.callLiar(room.code, socket.id, room);
      if ('error' in result) {
        socket.emit('hub:error', result.error);
        return;
      }

      io.to(room.code).emit('liars-dice:challengeResult', result);
      broadcastLiarsDiceState(io, room);
      schedulePostChallenge(io, room);
    });

    socket.on('liars-dice:callSpotOn', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'liars-dice') return;

      LiarsDice.clearRoomTimer(room.code);
      const result = LiarsDice.callSpotOn(room.code, socket.id, room);
      if ('error' in result) {
        socket.emit('hub:error', result.error);
        return;
      }

      io.to(room.code).emit('liars-dice:challengeResult', result);
      broadcastLiarsDiceState(io, room);
      schedulePostChallenge(io, room);
    });

    socket.on('liars-dice:nextRound', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'liars-dice') return;

      const state = LiarsDice.getGameState(room.code);
      if (!state || state.phase !== 'roundEnd') return;

      startNewLiarsDiceRound(io, room);
    });

    socket.on('liars-dice:endGame', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      // Set game phase to finished and broadcast BEFORE deleting game state
      const state = LiarsDice.getGameState(room.code);
      if (state) {
        state.phase = 'finished';
      }
      broadcastLiarsDiceState(io, room);
      LiarsDice.endGame(room.code);
      room.phase = 'lobby';
      room.currentGameId = null;
      // Keep selectedGameId so lobby remembers the last game played
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    socket.on('liars-dice:rematch', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const oldState = LiarsDice.getGameState(room.code);
      const settings = oldState?.settings;
      LiarsDice.endGame(room.code);

      room.phase = 'playing';
      LiarsDice.createGame(room, settings);

      io.to(room.code).emit('hub:roomUpdated', room);
      broadcastLiarsDiceState(io, room);

      // Send each player their dice
      sendDiceToPlayers(io, room);

      // Auto-advance from rolling to bidding after 5s
      setTimeout(() => {
        const state = LiarsDice.getGameState(room.code);
        if (state?.phase === 'rolling') {
          LiarsDice.startBidding(room.code);
          broadcastLiarsDiceState(io, room);
          startLiarsDiceTurnTimer(io, room);
        }
      }, 5000);

      console.log(`[Game] Liar's Dice rematch in ${room.code}`);
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
              broadcastStoryThiefState(io, room);
            }
          }

          // Clear pending replacement for disconnected player (any phase)
          if (state?.pendingReplacements.has(socket.id)) {
            state.pendingReplacements.delete(socket.id);
            broadcastStoryThiefState(io, room);
          }

          // Setup: if all remaining connected players submitted, start
          if (state?.phase === 'setup' && StoryThief.allPlayersSubmitted(room.code, room)) {
            if (!setupLocks.has(room.code)) {
              setupLocks.add(room.code);
              StoryThief.startRound(room.code, room);
              broadcastStoryThiefState(io, room);
              setTimeout(() => {
                setupLocks.delete(room.code);
                const s = StoryThief.getGameState(room.code);
                if (s?.phase === 'reveal') {
                  StoryThief.moveToQuestioning(room.code, room);
                  broadcastStoryThiefState(io, room);
                  if (room.settings.roundMode === 'timed') {
                    startTimer(io, room);
                  }
                }
              }, 3000);
            }
          }
        }

        if (room.currentGameId === 'liars-dice') {
          const state = LiarsDice.getGameState(room.code);
          if (state?.phase === 'bidding') {
            const activeId = state.aliveOrder[state.currentPlayerIndex];
            if (activeId === socket.id) {
              // Disconnected player's turn — grace period then auto-liar
              const graceKey = `${room.code}:${socket.id}`;
              const graceTimer = setTimeout(() => {
                disconnectGraceTimers.delete(graceKey);
                const result = LiarsDice.handleDisconnectedTurn(room.code, room);
                if (result) {
                  LiarsDice.clearRoomTimer(room.code);
                  io.to(room.code).emit('liars-dice:challengeResult', result);
                  broadcastLiarsDiceState(io, room);
                  schedulePostChallenge(io, room);
                } else {
                  // No bid to challenge, just advance turn
                  broadcastLiarsDiceState(io, room);
                  startLiarsDiceTurnTimer(io, room);
                }
              }, 10000); // 10s grace period
              disconnectGraceTimers.set(graceKey, graceTimer);
            }
          }

          // Rolling: check if all remaining rolls are in
          if (state?.phase === 'rolling' && LiarsDice.allRollsComplete(room.code, room)) {
            LiarsDice.startBidding(room.code);
            broadcastLiarsDiceState(io, room);
            startLiarsDiceTurnTimer(io, room);
          }
        }
      }
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  // ---- Zombie Player Cleanup (every 60s) ----
  // Remove players who disconnected 5+ minutes ago and never came back.
  // This frees up player slots and keeps lobbies clean.
  if (zombieCleanupInterval) clearInterval(zombieCleanupInterval);
  zombieCleanupInterval = setInterval(() => {
    const zombies = RoomManager.getZombiePlayers();
    for (const socketId of zombies) {
      // Clear any Liar's Dice grace timers for this zombie
      for (const [key, timer] of disconnectGraceTimers) {
        if (key.endsWith(`:${socketId}`)) {
          clearTimeout(timer);
          disconnectGraceTimers.delete(key);
        }
      }

      const result = RoomManager.removeDisconnectedPlayer(socketId);
      if (result) {
        io.to(result.roomCode).emit('hub:roomUpdated', result.room);
      }
    }
  }, 60 * 1000);

  return io;
}

function broadcastStoryThiefState(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) {
      const clientState = StoryThief.getClientState(room.code, pid, room);
      if (clientState) {
        io.to(pid).emit('story-thief:stateUpdated', clientState);
      }
    }
  }
}

function broadcastLiarsDiceState(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) {
      const clientState = LiarsDice.getClientState(room.code, pid, room);
      if (clientState) {
        io.to(pid).emit('liars-dice:stateUpdated', clientState);
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
      broadcastStoryThiefState(io, room);
    }
  }, 1000);

  // Register the timer so it can be cleaned up
  StoryThief.setRoomTimer(room.code, interval);
}

function startLiarsDiceTurnTimer(io: SocketIOServer, room: Room): void {
  const state = LiarsDice.getGameState(room.code);
  if (!state || state.phase !== 'bidding' || state.settings.turnTimer === 0) return;

  LiarsDice.clearRoomTimer(room.code);

  const turnEnd = Date.now() + state.settings.turnTimer * 1000;
  state.turnTimerEnd = turnEnd;

  const interval = setInterval(() => {
    const currentState = LiarsDice.getGameState(room.code);
    if (!currentState || currentState.phase !== 'bidding' || !currentState.turnTimerEnd) {
      LiarsDice.clearRoomTimer(room.code);
      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((currentState.turnTimerEnd - Date.now()) / 1000));
    io.to(room.code).emit('liars-dice:turnTimer', secondsLeft);

    if (secondsLeft <= 0) {
      LiarsDice.clearRoomTimer(room.code);

      // Auto-call liar if there's a bid, otherwise skip turn
      if (currentState.currentBid) {
        const activeId = currentState.aliveOrder[currentState.currentPlayerIndex];
        if (activeId) {
          const result = LiarsDice.callLiar(room.code, activeId, room);
          if (!('error' in result)) {
            io.to(room.code).emit('liars-dice:challengeResult', result);
            broadcastLiarsDiceState(io, room);
            schedulePostChallenge(io, room);
          }
        }
      }
    }
  }, 1000);

  LiarsDice.setRoomTimer(room.code, interval);
}

// ---- Liar's Dice Helpers ----

/** Send each connected player their dice values */
function sendDiceToPlayers(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) {
      const dice = LiarsDice.getPlayerDice(room.code, pid);
      if (dice) {
        io.to(pid).emit('liars-dice:diceRolled', dice);
      }
    }
  }
}

/** Start a new round: roll dice, send them, auto-advance to bidding after 5s */
function startNewLiarsDiceRound(io: SocketIOServer, room: Room): void {
  LiarsDice.startNewRound(room.code, room);
  broadcastLiarsDiceState(io, room);
  sendDiceToPlayers(io, room);

  // Auto-advance from rolling to bidding after 5s
  setTimeout(() => {
    const state = LiarsDice.getGameState(room.code);
    if (state?.phase === 'rolling') {
      LiarsDice.startBidding(room.code);
      broadcastLiarsDiceState(io, room);
      startLiarsDiceTurnTimer(io, room);
    }
  }, 5000);
}

/**
 * After a challenge (liar/spotOn), schedule the reveal → apply → next round flow.
 * Pacing: 8s reveal → apply lives → 3s roundEnd pause → start new round
 */
function schedulePostChallenge(io: SocketIOServer, room: Room): void {
  // 8s to let players read the reveal and see all dice
  setTimeout(() => {
    const { gameOver } = LiarsDice.applyChallenge(room.code, room);
    broadcastLiarsDiceState(io, room);

    if (gameOver) {
      room.phase = 'finished';
      io.to(room.code).emit('hub:roomUpdated', room);
    } else {
      // 3s pause on roundEnd screen before starting next round
      setTimeout(() => {
        startNewLiarsDiceRound(io, room);
      }, 3000);
    }
  }, 8000);
}
