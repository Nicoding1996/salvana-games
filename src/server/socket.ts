import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket-events';
import type { Room } from '@/types/hub';
import * as RoomManager from './hub/RoomManager';
import * as StoryThief from './games/story-thief/StoryThiefGame';
import * as LiarsDice from './games/liars-dice/LiarsDiceGame';
import * as Battleship from './games/battleship/BattleshipGame';
import * as Poker from './games/poker/PokerGame';
import * as Flip7 from './games/flip7/Flip7Game';

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
        if (result.room.currentGameId === 'battleship') {
          Battleship.swapPlayerId(result.room.code, result.oldId, socket.id);
          const clientState = Battleship.getClientState(result.room.code, socket.id, result.room);
          if (clientState) {
            socket.emit('battleship:stateUpdated', clientState);
          }
        }
        if (result.room.currentGameId === 'poker') {
          Poker.swapPlayerId(result.room.code, result.oldId, socket.id);
          const clientState = Poker.getClientState(result.room.code, socket.id, result.room);
          if (clientState) {
            socket.emit('poker:stateUpdated', clientState);
          }
        }
        if (result.room.currentGameId === 'flip7') {
          Flip7.swapPlayerId(result.room.code, result.oldId, socket.id);
          // Clear any disconnect grace timer
          const graceKey = `${result.room.code}:${result.oldId}`;
          const graceTimer = disconnectGraceTimers.get(graceKey);
          if (graceTimer) {
            clearTimeout(graceTimer);
            disconnectGraceTimers.delete(graceKey);
          }
          const clientState = Flip7.getClientState(result.room.code, socket.id, result.room);
          if (clientState) {
            socket.emit('flip7:stateUpdated', clientState);
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

    socket.on('hub:kickPlayer', (data) => {
      const result = RoomManager.kickPlayer(socket.id, data.playerId);
      if (!result) return;

      // Notify the kicked player
      io.to(data.playerId).emit('hub:kicked', { reason: 'You were removed by the host' });
      // Make the kicked player leave the socket room
      const kickedSocket = io.sockets.sockets.get(data.playerId);
      if (kickedSocket) {
        kickedSocket.leave(result.room.code);
      }
      // Notify remaining players
      io.to(result.room.code).emit('hub:playerLeft', data.playerId);
      io.to(result.room.code).emit('hub:roomUpdated', result.room);
    });

    socket.on('hub:changeAvatar', (data) => {
      const avatar = (data.avatar || '').trim();
      if (!avatar) return;
      const room = RoomManager.changeAvatar(socket.id, avatar);
      if (room) {
        io.to(room.code).emit('hub:roomUpdated', room);
      }
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
        LiarsDice.createGame(room, gameSettings as Partial<import('@/types/games/liars-dice').LiarsDiceSettings>);

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

      if (gameId === 'battleship') {
        room.currentGameId = 'battleship';
        room.selectedGameId = 'battleship';
        room.phase = 'playing';
        Battleship.createGame(room, gameSettings as Partial<import('@/types/games/battleship').BattleshipSettings>);

        io.to(room.code).emit('hub:roomUpdated', room);
        broadcastBattleshipState(io, room);

        // Start placement timer if configured
        startBattleshipPlacementTimer(io, room);

        console.log(`[Game] Battleship started in ${room.code}`);
      }

      if (gameId === 'poker') {
        room.currentGameId = 'poker';
        room.selectedGameId = 'poker';
        room.phase = 'playing';
        Poker.createGame(room, gameSettings as Partial<import('@/types/games/poker').PokerSettings>);

        io.to(room.code).emit('hub:roomUpdated', room);
        broadcastPokerState(io, room);
        startPokerTurnTimer(io, room);

        console.log(`[Game] Poker started in ${room.code}`);
      }

      if (gameId === 'flip7') {
        room.currentGameId = 'flip7';
        room.selectedGameId = 'flip7';
        room.phase = 'playing';
        Flip7.createGame(room, gameSettings as Partial<import('@/types/games/flip7').Flip7Settings>);

        io.to(room.code).emit('hub:roomUpdated', room);

        // Deal initial cards after brief animation delay
        setTimeout(() => {
          const state = Flip7.getGameState(room.code);
          if (state?.phase === 'dealing') {
            Flip7.dealInitialCards(room.code, room);
            broadcastFlip7State(io, room);
            startFlip7TurnTimer(io, room);
          }
        }, 2000);

        console.log(`[Game] Flip 7 started in ${room.code}`);
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
      if (room.currentGameId === 'battleship') {
        const clientState = Battleship.getClientState(room.code, socket.id, room);
        if (clientState) {
          socket.emit('battleship:stateUpdated', clientState);
        }
      }
      if (room.currentGameId === 'poker') {
        const clientState = Poker.getClientState(room.code, socket.id, room);
        if (clientState) {
          socket.emit('poker:stateUpdated', clientState);
        }
      }
      if (room.currentGameId === 'flip7') {
        const clientState = Flip7.getClientState(room.code, socket.id, room);
        if (clientState) {
          socket.emit('flip7:stateUpdated', clientState);
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

    // ---- Battleship Events ----

    socket.on('battleship:placeShips', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'battleship') return;

      const result = Battleship.placeShips(room.code, socket.id, data.placements);
      if (!result.success) {
        socket.emit('hub:error', result.error || 'Invalid placement');
        return;
      }

      broadcastBattleshipState(io, room);

      // Check if all players ready
      if (Battleship.allPlayersReady(room.code, room)) {
        Battleship.clearRoomTimer(room.code);
        Battleship.startBattle(room.code);
        broadcastBattleshipState(io, room);
        startBattleshipTurnTimer(io, room);
      }
    });

    socket.on('battleship:autoPlace', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'battleship') return;

      const result = Battleship.autoPlaceShips(room.code, socket.id);
      if (!result.success) {
        socket.emit('hub:error', 'Failed to auto-place ships');
        return;
      }

      broadcastBattleshipState(io, room);

      // Check if all players ready
      if (Battleship.allPlayersReady(room.code, room)) {
        Battleship.clearRoomTimer(room.code);
        Battleship.startBattle(room.code);
        broadcastBattleshipState(io, room);
        startBattleshipTurnTimer(io, room);
      }
    });

    socket.on('battleship:fire', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'battleship') return;

      const result = Battleship.fireShot(room.code, socket.id, data.targetId, data.coordinate, room);
      if (!result.success) {
        socket.emit('hub:error', result.error || 'Invalid shot');
        return;
      }

      // Broadcast shot result to all
      const state = Battleship.getGameState(room.code);
      if (state && state.lastTurnShots.length > 0) {
        const lastShot = state.lastTurnShots[state.lastTurnShots.length - 1];
        io.to(room.code).emit('battleship:shotResult', lastShot);
      }

      // Check if game is over (only 1 player alive)
      if (state) {
        const alivePlayers = state.turnOrder.filter(id => state.playerData[id]?.alive);
        if (alivePlayers.length <= 1) {
          Battleship.clearRoomTimer(room.code);
          Battleship.endTurn(room.code, room);
          broadcastBattleshipState(io, room);
          room.phase = 'finished';
          io.to(room.code).emit('hub:roomUpdated', room);
          return;
        }
      }

      // Auto-advance turn when all shots are fired (only counts actual shots, not sonar/abilities)
      const shotsRemaining = Battleship.getShotsRemainingForTurn(room.code, socket.id);
      if (shotsRemaining === 0) {
        // Brief delay so player sees their last shot result before turn advances
        setTimeout(() => {
          const currentRoom = RoomManager.getRoom(room.code);
          if (!currentRoom || currentRoom.currentGameId !== 'battleship') return;
          const currentState = Battleship.getGameState(room.code);
          if (!currentState || currentState.phase !== 'battle') return;
          // Verify it's still this player's turn (hasn't already been ended)
          if (currentState.turnOrder[currentState.currentPlayerIndex] !== socket.id) return;

          Battleship.clearRoomTimer(room.code);
          const { gameOver } = Battleship.endTurn(room.code, currentRoom);
          broadcastBattleshipState(io, currentRoom);

          if (gameOver) {
            currentRoom.phase = 'finished';
            io.to(room.code).emit('hub:roomUpdated', currentRoom);
          } else {
            startBattleshipTurnTimer(io, currentRoom);
          }
        }, 1200);
        // Broadcast current state immediately so player sees last shot result
        broadcastBattleshipState(io, room);
        return;
      }

      broadcastBattleshipState(io, room);
    });

    socket.on('battleship:endTurn', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'battleship') return;

      const state = Battleship.getGameState(room.code);
      if (!state || state.phase !== 'battle') return;
      if (state.turnOrder[state.currentPlayerIndex] !== socket.id) return;

      Battleship.clearRoomTimer(room.code);
      const { gameOver } = Battleship.endTurn(room.code, room);
      broadcastBattleshipState(io, room);

      if (gameOver) {
        room.phase = 'finished';
        io.to(room.code).emit('hub:roomUpdated', room);
      } else {
        startBattleshipTurnTimer(io, room);
      }
    });

    socket.on('battleship:useSonar', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'battleship') return;

      const result = Battleship.useSonar(room.code, socket.id, data.targetId, data.topLeft);
      if (!result.success) {
        socket.emit('hub:error', result.error || 'Sonar failed');
        return;
      }

      // Send sonar result to the player who used it
      socket.emit('battleship:sonarResult', {
        hasShip: result.hasShip!,
        topLeft: data.topLeft,
        targetId: data.targetId,
      });
      broadcastBattleshipState(io, room);
    });

    socket.on('battleship:endGame', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const state = Battleship.getGameState(room.code);
      if (state) {
        state.phase = 'finished';
      }
      broadcastBattleshipState(io, room);
      Battleship.endGame(room.code);
      room.phase = 'lobby';
      room.currentGameId = null;
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    socket.on('battleship:rematch', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const oldState = Battleship.getGameState(room.code);
      const settings = oldState?.settings;
      Battleship.endGame(room.code);

      room.phase = 'playing';
      Battleship.createGame(room, settings);

      io.to(room.code).emit('hub:roomUpdated', room);
      broadcastBattleshipState(io, room);
      startBattleshipPlacementTimer(io, room);

      console.log(`[Game] Battleship rematch in ${room.code}`);
    });

    // ---- Poker Events ----

    socket.on('poker:action', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'poker') return;

      Poker.clearRoomTimer(room.code);
      const result = Poker.playerAction(room.code, socket.id, data.action, data.raiseAmount, room);
      if (!result.success) {
        socket.emit('hub:error', result.error || 'Invalid action');
        return;
      }

      broadcastPokerState(io, room);

      if (result.handComplete) {
        // Hand is over — showdown or fold win
        const state = Poker.getGameState(room.code);
        if (state?.lastShowdown) {
          io.to(room.code).emit('poker:showdown', state.lastShowdown);
        }
        // Schedule next hand after pause
        setTimeout(() => {
          // Guard: game might have been ended during the pause
          const currentState = Poker.getGameState(room.code);
          if (!currentState || currentState.phase === 'finished') return;

          const { gameOver } = Poker.startNextHand(room.code, room);
          if (gameOver) {
            const superlatives = Poker.getSuperlatives(room.code, room);
            io.to(room.code).emit('poker:superlatives', superlatives);
            room.phase = 'finished';
            io.to(room.code).emit('hub:roomUpdated', room);
          }
          broadcastPokerState(io, room);
          if (!gameOver) {
            startPokerTurnTimer(io, room);
          }
        }, state?.lastShowdown ? 8000 : 3000); // longer pause for showdown
      } else {
        startPokerTurnTimer(io, room);
      }
    });

    socket.on('poker:reaction', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'poker') return;
      // Broadcast reaction to all players
      socket.to(room.code).emit('poker:reaction', { playerId: socket.id, emoji: data.emoji });
    });

    socket.on('poker:endGame', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const state = Poker.getGameState(room.code);
      if (state) {
        state.phase = 'finished';
        const superlatives = Poker.getSuperlatives(room.code, room);
        io.to(room.code).emit('poker:superlatives', superlatives);
      }
      broadcastPokerState(io, room);
      Poker.endGame(room.code);
      room.phase = 'lobby';
      room.currentGameId = null;
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    socket.on('poker:rematch', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const oldState = Poker.getGameState(room.code);
      const settings = oldState?.settings;
      Poker.endGame(room.code);

      room.phase = 'playing';
      Poker.createGame(room, settings);

      io.to(room.code).emit('hub:roomUpdated', room);
      broadcastPokerState(io, room);
      startPokerTurnTimer(io, room);

      console.log(`[Game] Poker rematch in ${room.code}`);
    });

    // ---- Flip 7 Events ----

    socket.on('flip7:hit', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'flip7') return;

      Flip7.clearRoomTimer(room.code);
      const result = Flip7.hit(room.code, socket.id);
      if (!result) return;

      // Broadcast card flip to all players
      const player = room.players[socket.id];
      io.to(room.code).emit('flip7:cardFlipped', {
        playerId: socket.id,
        playerName: player?.name || 'Unknown',
        card: result.card,
        result: result.result,
      });

      // Add to activity log
      Flip7.addActivityLog(room.code, {
        playerId: socket.id,
        playerName: player?.name || 'Unknown',
        card: result.card,
        result: result.result,
        timestamp: Date.now(),
      });

      if (result.turnResult === 'roundEnd') {
        // Delay round end so bust/flip7 animation has time to play
        broadcastFlip7State(io, room);
        setTimeout(() => {
          const roundResult = Flip7.endRound(room.code);
          if (roundResult) {
            io.to(room.code).emit('flip7:roundEnd', roundResult);
          }
          broadcastFlip7State(io, room);
        }, 2000);
        return;
      }

      broadcastFlip7State(io, room);

      if (result.turnResult === 'continue' && !result.pendingAction && !result.pendingModifier) {
        startFlip7TurnTimer(io, room);
      }
    });

    socket.on('flip7:stay', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'flip7') return;

      Flip7.clearRoomTimer(room.code);
      const result = Flip7.stay(room.code, socket.id);
      if (result === null) return;

      // Add to activity log
      const player = room.players[socket.id];
      Flip7.addActivityLog(room.code, {
        playerId: socket.id,
        playerName: player?.name || 'Unknown',
        card: null,
        result: 'stayed',
        timestamp: Date.now(),
      });

      if (result === 'roundEnd') {
        // Brief pause before showing round summary
        broadcastFlip7State(io, room);
        setTimeout(() => {
          const roundResult = Flip7.endRound(room.code);
          if (roundResult) {
            io.to(room.code).emit('flip7:roundEnd', roundResult);
          }
          broadcastFlip7State(io, room);
        }, 1500);
        return;
      }

      broadcastFlip7State(io, room);

      if (result === 'continue') {
        startFlip7TurnTimer(io, room);
      }
    });

    socket.on('flip7:useAction', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'flip7') return;

      Flip7.clearRoomTimer(room.code);
      const result = Flip7.useAction(room.code, socket.id, data.targetId);
      if (!result) return;

      if (result.type === 'freeze') {
        const targetPlayer = room.players[data.targetId];
        const drawerPlayer = room.players[socket.id];
        Flip7.addActivityLog(room.code, {
          playerId: data.targetId,
          playerName: targetPlayer?.name || 'Unknown',
          card: { type: 'action', kind: 'freeze' },
          result: 'frozen',
          timestamp: Date.now(),
        });
        // Notify all players about the action
        io.to(room.code).emit('flip7:actionUsed', {
          type: 'freeze',
          byName: drawerPlayer?.name || 'Unknown',
          targetId: data.targetId,
          targetName: targetPlayer?.name || 'Unknown',
        });
      }

      if (result.type === 'flipThree' && result.flipThreeResults) {
        const targetPlayer = room.players[data.targetId];
        const drawerPlayer = room.players[socket.id];
        // Notify all players about the action
        io.to(room.code).emit('flip7:actionUsed', {
          type: 'flipThree',
          byName: drawerPlayer?.name || 'Unknown',
          targetId: data.targetId,
          targetName: targetPlayer?.name || 'Unknown',
        });
        // Log each card drawn for the target
        for (const r of result.flipThreeResults) {
          io.to(room.code).emit('flip7:cardFlipped', {
            playerId: data.targetId,
            playerName: targetPlayer?.name || 'Unknown',
            card: r.card,
            result: r.result,
          });
          Flip7.addActivityLog(room.code, {
            playerId: data.targetId,
            playerName: targetPlayer?.name || 'Unknown',
            card: r.card,
            result: r.result,
            timestamp: Date.now(),
          });
        }
      }

      if (result.turnResult === 'roundEnd') {
        broadcastFlip7State(io, room);
        setTimeout(() => {
          const roundResult = Flip7.endRound(room.code);
          if (roundResult) {
            io.to(room.code).emit('flip7:roundEnd', roundResult);
          }
          broadcastFlip7State(io, room);
        }, 1500);
        return;
      }

      broadcastFlip7State(io, room);

      if (result.turnResult === 'continue') {
        startFlip7TurnTimer(io, room);
      }
    });

    socket.on('flip7:giveModifier', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'flip7') return;

      const result = Flip7.giveModifier(room.code, socket.id, data.targetId);
      if (result === null) return;

      // Modifier choice doesn't end turn — broadcast state and restart timer
      broadcastFlip7State(io, room);
      startFlip7TurnTimer(io, room);
    });

    socket.on('flip7:chaosChoice', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'flip7') return;

      Flip7.chaosSubmit(room.code, socket.id, data.choice);

      if (Flip7.allChaosChoicesIn(room.code)) {
        Flip7.clearRoomTimer(room.code);
        const chaosResult = Flip7.resolveChaos(room.code);
        if (!chaosResult) return;

        // Broadcast each card flip
        for (const r of chaosResult.results) {
          if (r.choice === 'hit' && r.card) {
            const player = room.players[r.playerId];
            io.to(room.code).emit('flip7:cardFlipped', {
              playerId: r.playerId,
              playerName: player?.name || 'Unknown',
              card: r.card,
              result: r.result || 'safe',
            });
          }
        }

        if (chaosResult.roundEnd) {
          const roundResult = Flip7.endRound(room.code);
          if (roundResult) {
            io.to(room.code).emit('flip7:roundEnd', roundResult);
          }
        }

        broadcastFlip7State(io, room);

        if (!chaosResult.roundEnd) {
          startFlip7TurnTimer(io, room);
        }
      }
    });

    socket.on('flip7:nextRound', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id || room.currentGameId !== 'flip7') return;

      const success = Flip7.nextRound(room.code, room);
      if (!success) return;

      // Broadcast dealing state immediately so clients see animation
      broadcastFlip7State(io, room);

      // Deal after animation delay
      setTimeout(() => {
        const state = Flip7.getGameState(room.code);
        if (state?.phase === 'dealing') {
          Flip7.dealInitialCards(room.code, room);
          broadcastFlip7State(io, room);
          startFlip7TurnTimer(io, room);
        }
      }, 2000);
    });

    socket.on('flip7:endGame', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const state = Flip7.getGameState(room.code);
      if (state) {
        state.phase = 'finished';
      }
      broadcastFlip7State(io, room);
      Flip7.endGame(room.code);
      room.phase = 'lobby';
      room.currentGameId = null;
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    socket.on('flip7:rematch', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return;

      const oldState = Flip7.getGameState(room.code);
      const settings = oldState?.settings;
      Flip7.endGame(room.code);

      room.phase = 'playing';
      Flip7.createGame(room, settings);

      io.to(room.code).emit('hub:roomUpdated', room);

      // Deal after animation delay
      setTimeout(() => {
        const state = Flip7.getGameState(room.code);
        if (state?.phase === 'dealing') {
          Flip7.dealInitialCards(room.code, room);
          broadcastFlip7State(io, room);
          startFlip7TurnTimer(io, room);
        }
      }, 2000);

      console.log(`[Game] Flip 7 rematch in ${room.code}`);
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

        if (room.currentGameId === 'battleship') {
          const state = Battleship.getGameState(room.code);

          // Placement: check if all remaining connected players are ready
          if (state?.phase === 'placement' && Battleship.allPlayersReady(room.code, room)) {
            Battleship.clearRoomTimer(room.code);
            Battleship.startBattle(room.code);
            broadcastBattleshipState(io, room);
            startBattleshipTurnTimer(io, room);
          }

          // Battle: if it's the disconnected player's turn, auto-fire after grace period
          if (state?.phase === 'battle') {
            const activeId = state.turnOrder[state.currentPlayerIndex];
            if (activeId === socket.id) {
              const graceKey = `${room.code}:${socket.id}`;
              const graceTimer = setTimeout(() => {
                disconnectGraceTimers.delete(graceKey);
                Battleship.clearRoomTimer(room.code);
                Battleship.handleDisconnectedTurn(room.code, room);
                const { gameOver } = Battleship.endTurn(room.code, room);
                broadcastBattleshipState(io, room);
                if (gameOver) {
                  room.phase = 'finished';
                  io.to(room.code).emit('hub:roomUpdated', room);
                } else {
                  startBattleshipTurnTimer(io, room);
                }
              }, 10000);
              disconnectGraceTimers.set(graceKey, graceTimer);
            }
          }
        }

        if (room.currentGameId === 'poker') {
          const state = Poker.getGameState(room.code);
          if (state) {
            const bettingPhases = ['preflop', 'flop', 'turn', 'river'];
            if (bettingPhases.includes(state.phase)) {
              const activeId = state.bettingOrder[state.currentPlayerIndex];
              if (activeId === socket.id) {
                // Disconnected player's turn — grace period then auto-fold/check
                const graceKey = `${room.code}:${socket.id}`;
                const graceTimer = setTimeout(() => {
                  disconnectGraceTimers.delete(graceKey);
                  Poker.clearRoomTimer(room.code);
                  const currentGameState = Poker.getGameState(room.code);
                  if (!currentGameState || currentGameState.phase === 'finished') return;

                  const acted = Poker.handleDisconnectedTurn(room.code, room);
                  if (acted) {
                    broadcastPokerState(io, room);
                    const updatedState = Poker.getGameState(room.code);
                    if (updatedState?.phase === 'roundEnd') {
                      if (updatedState.lastShowdown) {
                        io.to(room.code).emit('poker:showdown', updatedState.lastShowdown);
                      }
                      setTimeout(() => {
                        const nextState = Poker.getGameState(room.code);
                        if (!nextState || nextState.phase === 'finished') return;
                        const { gameOver } = Poker.startNextHand(room.code, room);
                        if (gameOver) {
                          room.phase = 'finished';
                          io.to(room.code).emit('hub:roomUpdated', room);
                        }
                        broadcastPokerState(io, room);
                        if (!gameOver) startPokerTurnTimer(io, room);
                      }, 3000);
                    } else {
                      startPokerTurnTimer(io, room);
                    }
                  }
                }, 10000);
                disconnectGraceTimers.set(graceKey, graceTimer);
              }
            }
          }
        }

        if (room.currentGameId === 'flip7') {
          const state = Flip7.getGameState(room.code);
          if (state && state.phase === 'playing' && state.settings.mode === 'classic') {
            const activeId = state.turnOrder[state.currentPlayerIndex];
            if (activeId === socket.id) {
              // Disconnected player's turn — grace period then auto-stay
              const graceKey = `${room.code}:${socket.id}`;
              const graceTimer = setTimeout(() => {
                disconnectGraceTimers.delete(graceKey);
                Flip7.clearRoomTimer(room.code);
                const currentState = Flip7.getGameState(room.code);
                if (!currentState || currentState.phase !== 'playing') return;

                const result = Flip7.handleDisconnectedTurn(room.code);
                if (result === 'roundEnd') {
                  const roundResult = Flip7.endRound(room.code);
                  if (roundResult) {
                    io.to(room.code).emit('flip7:roundEnd', roundResult);
                  }
                }
                broadcastFlip7State(io, room);
                if (result === 'continue') {
                  startFlip7TurnTimer(io, room);
                }
              }, 10000);
              disconnectGraceTimers.set(graceKey, graceTimer);
            }
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


// ---- Battleship Helpers ----

function broadcastBattleshipState(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) {
      const clientState = Battleship.getClientState(room.code, pid, room);
      if (clientState) {
        io.to(pid).emit('battleship:stateUpdated', clientState);
      }
    }
  }
}

function startBattleshipTurnTimer(io: SocketIOServer, room: Room): void {
  const state = Battleship.getGameState(room.code);
  if (!state || state.phase !== 'battle' || state.settings.turnTimer === 0) return;

  Battleship.clearRoomTimer(room.code);

  const turnEnd = Date.now() + state.settings.turnTimer * 1000;
  state.turnTimerEnd = turnEnd;

  const interval = setInterval(() => {
    const currentState = Battleship.getGameState(room.code);
    if (!currentState || currentState.phase !== 'battle' || !currentState.turnTimerEnd) {
      Battleship.clearRoomTimer(room.code);
      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((currentState.turnTimerEnd - Date.now()) / 1000));
    io.to(room.code).emit('battleship:turnTimer', secondsLeft);

    if (secondsLeft <= 0) {
      Battleship.clearRoomTimer(room.code);

      // Auto-fire random shots and end turn
      Battleship.handleDisconnectedTurn(room.code, room);
      const { gameOver } = Battleship.endTurn(room.code, room);
      broadcastBattleshipState(io, room);

      if (gameOver) {
        room.phase = 'finished';
        io.to(room.code).emit('hub:roomUpdated', room);
      } else {
        startBattleshipTurnTimer(io, room);
      }
    }
  }, 1000);

  Battleship.setRoomTimer(room.code, interval);
}

function startBattleshipPlacementTimer(io: SocketIOServer, room: Room): void {
  const state = Battleship.getGameState(room.code);
  if (!state || state.phase !== 'placement' || state.settings.placementTimer === 0) return;

  Battleship.clearRoomTimer(room.code);

  const placementEnd = Date.now() + state.settings.placementTimer * 1000;
  state.placementTimerEnd = placementEnd;

  const interval = setInterval(() => {
    const currentState = Battleship.getGameState(room.code);
    if (!currentState || currentState.phase !== 'placement' || !currentState.placementTimerEnd) {
      Battleship.clearRoomTimer(room.code);
      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((currentState.placementTimerEnd - Date.now()) / 1000));
    io.to(room.code).emit('battleship:placementTimer', secondsLeft);

    if (secondsLeft <= 0) {
      Battleship.clearRoomTimer(room.code);

      // Auto-place for any players who haven't placed yet
      for (const pid of currentState.turnOrder) {
        if (!currentState.playerData[pid]?.ready) {
          Battleship.autoPlaceShips(room.code, pid);
        }
      }

      // Start battle
      Battleship.startBattle(room.code);
      broadcastBattleshipState(io, room);
      startBattleshipTurnTimer(io, room);
    }
  }, 1000);

  Battleship.setRoomTimer(room.code, interval);
}

// ---- Poker Helpers ----

function broadcastPokerState(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) {
      const clientState = Poker.getClientState(room.code, pid, room);
      if (clientState) {
        io.to(pid).emit('poker:stateUpdated', clientState);
      }
    }
  }
}

function startPokerTurnTimer(io: SocketIOServer, room: Room): void {
  const state = Poker.getGameState(room.code);
  if (!state || state.settings.turnTimer === 0) return;

  const bettingPhases = ['preflop', 'flop', 'turn', 'river'];
  if (!bettingPhases.includes(state.phase)) return;

  Poker.clearRoomTimer(room.code);

  const turnEnd = Date.now() + state.settings.turnTimer * 1000;
  state.turnTimerEnd = turnEnd;

  const interval = setInterval(() => {
    const currentState = Poker.getGameState(room.code);
    if (!currentState || !currentState.turnTimerEnd) {
      Poker.clearRoomTimer(room.code);
      return;
    }

    const bPhases = ['preflop', 'flop', 'turn', 'river'];
    if (!bPhases.includes(currentState.phase)) {
      Poker.clearRoomTimer(room.code);
      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((currentState.turnTimerEnd - Date.now()) / 1000));
    io.to(room.code).emit('poker:turnTimer', secondsLeft);

    if (secondsLeft <= 0) {
      Poker.clearRoomTimer(room.code);

      // Auto-fold (or check if possible)
      const acted = Poker.handleDisconnectedTurn(room.code, room);
      if (acted) {
        broadcastPokerState(io, room);
        const updatedState = Poker.getGameState(room.code);
        if (updatedState?.phase === 'roundEnd' || updatedState?.phase === 'showdown') {
          if (updatedState.lastShowdown) {
            io.to(room.code).emit('poker:showdown', updatedState.lastShowdown);
          }
          setTimeout(() => {
            const nextState = Poker.getGameState(room.code);
            if (!nextState || nextState.phase === 'finished') return;
            const { gameOver } = Poker.startNextHand(room.code, room);
            if (gameOver) {
              const superlatives = Poker.getSuperlatives(room.code, room);
              io.to(room.code).emit('poker:superlatives', superlatives);
              room.phase = 'finished';
              io.to(room.code).emit('hub:roomUpdated', room);
            }
            broadcastPokerState(io, room);
            if (!gameOver) startPokerTurnTimer(io, room);
          }, updatedState.lastShowdown ? 8000 : 3000);
        } else {
          startPokerTurnTimer(io, room);
        }
      }
    }
  }, 1000);

  Poker.setRoomTimer(room.code, interval);
}

// ---- Flip 7 Helpers ----

function broadcastFlip7State(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) {
      const clientState = Flip7.getClientState(room.code, pid, room);
      if (clientState) {
        io.to(pid).emit('flip7:stateUpdated', clientState);
      }
    }
  }
}

function startFlip7TurnTimer(io: SocketIOServer, room: Room): void {
  const state = Flip7.getGameState(room.code);
  if (!state || state.phase !== 'playing' || state.settings.turnTimer === 0) return;

  Flip7.clearRoomTimer(room.code);

  const turnEnd = Date.now() + state.settings.turnTimer * 1000;
  state.turnTimerEnd = turnEnd;

  const interval = setInterval(() => {
    const currentState = Flip7.getGameState(room.code);
    if (!currentState || currentState.phase !== 'playing' || !currentState.turnTimerEnd) {
      Flip7.clearRoomTimer(room.code);
      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((currentState.turnTimerEnd - Date.now()) / 1000));
    io.to(room.code).emit('flip7:turnTimer', secondsLeft);

    if (secondsLeft <= 0) {
      Flip7.clearRoomTimer(room.code);

      if (currentState.settings.mode === 'classic') {
        // Auto-stay for current player
        const result = Flip7.handleDisconnectedTurn(room.code);
        if (result === 'roundEnd') {
          const roundResult = Flip7.endRound(room.code);
          if (roundResult) {
            io.to(room.code).emit('flip7:roundEnd', roundResult);
          }
        }
        broadcastFlip7State(io, room);
        if (result === 'continue') {
          startFlip7TurnTimer(io, room);
        }
      } else {
        // Chaos mode: auto-stay for anyone who hasn't submitted
        const activePlayers = currentState.turnOrder.filter(id =>
          currentState.playerData[id].roundStatus === 'active'
        );
        for (const pid of activePlayers) {
          if (!currentState.chaosChoices || !currentState.chaosChoices[pid]) {
            Flip7.chaosSubmit(room.code, pid, 'stay');
          }
        }
        // Resolve
        const chaosResult = Flip7.resolveChaos(room.code);
        if (chaosResult) {
          for (const r of chaosResult.results) {
            if (r.choice === 'hit' && r.card) {
              const player = room.players[r.playerId];
              io.to(room.code).emit('flip7:cardFlipped', {
                playerId: r.playerId,
                playerName: player?.name || 'Unknown',
                card: r.card,
                result: r.result || 'safe',
              });
            }
          }
          if (chaosResult.roundEnd) {
            const roundResult = Flip7.endRound(room.code);
            if (roundResult) {
              io.to(room.code).emit('flip7:roundEnd', roundResult);
            }
          }
          broadcastFlip7State(io, room);
          if (!chaosResult.roundEnd) {
            startFlip7TurnTimer(io, room);
          }
        }
      }
    }
  }, 1000);

  Flip7.setRoomTimer(room.code, interval);
}
