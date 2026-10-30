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
import {
  type Flip7FlipEvent,
  type Flip7Settings,
  flipDisplayMs,
  flipSequenceDurationMs,
  chaosBatchDurationMs,
  ACTION_ANIMATION_MS,
  ACTION_TIMEOUT_MS,
  DEAL_ANIMATION_MS,
  DISCONNECT_GRACE_MS,
  FLIP_CARD_GAP_MS,
  STAY_ROUND_END_DELAY_MS,
} from '@/types/games/flip7';

import {
  POKER_REACTIONS,
  POKER_MIN_PLAYERS,
  POKER_MAX_PLAYERS,
  POKER_DEAL_MS,
  POKER_RUNOUT_STEP_MS,
  POKER_SHOWDOWN_PAUSE_MS,
  POKER_UNCONTESTED_PAUSE_MS,
  POKER_AWAY_GRACE_S,
  POKER_AWAY_REPEAT_S,
} from '@/types/games/poker';

// Poker reaction rate limit (socketId → last reaction time)
const pokerReactionTimes = new Map<string, number>();
const POKER_REACTION_COOLDOWN_MS = 800;
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
          handlePokerReconnect(io, result.room, result.oldId, socket.id);
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
          // Everyone needs the new ID (turn order, active player), not just the rejoining socket
          broadcastFlip7State(io, result.room);
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
        if (result.room.currentGameId === 'flip7') {
          handleFlip7Departure(io, result.room, socket.id);
        }
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
        const seated = RoomManager.getConnectedPlayerCount(room);
        if (seated < POKER_MIN_PLAYERS || seated > POKER_MAX_PLAYERS) return;
        room.currentGameId = 'poker';
        room.selectedGameId = 'poker';
        room.phase = 'playing';
        Poker.createGame(room, gameSettings as Partial<import('@/types/games/poker').PokerSettings>);

        io.to(room.code).emit('hub:roomUpdated', room);
        drivePoker(io, room);

        console.log(`[Game] Poker started in ${room.code}`);
      }

      if (gameId === 'flip7') {
        room.currentGameId = 'flip7';
        room.selectedGameId = 'flip7';
        room.phase = 'playing';
        Flip7.createGame(room, gameSettings as Partial<Flip7Settings>);

        io.to(room.code).emit('hub:roomUpdated', room);
        scheduleFlip7Deal(io, room);

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
          socket.emit('poker:turnTimer', Poker.getTurnTimerSnapshot(room.code));
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

      // Validate first: a rejected action (double tap, stale client) must not touch the turn clock
      const result = Poker.playerAction(room.code, socket.id, data?.action, data?.raiseAmount);
      if (!result.success) {
        socket.emit('poker:actionRejected', result.error);
        return;
      }
      drivePoker(io, room);
    });

    socket.on('poker:reaction', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'poker') return;
      const emoji = data?.emoji;
      if (!POKER_REACTIONS.some(r => r === emoji)) return;
      // Light rate limit so reactions can't flood the table
      const now = Date.now();
      if (now - (pokerReactionTimes.get(socket.id) ?? 0) < POKER_REACTION_COOLDOWN_MS) return;
      pokerReactionTimes.set(socket.id, now);
      io.to(room.code).emit('poker:reaction', { playerId: socket.id, emoji });
    });

    socket.on('poker:endGame', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id || room.currentGameId !== 'poker') return;

      Poker.endGame(room.code);
      room.phase = 'lobby';
      room.currentGameId = null;
      // Keep selectedGameId so the lobby remembers the last game played
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    socket.on('poker:rematch', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id || room.currentGameId !== 'poker') return;

      const oldState = Poker.getGameState(room.code);
      if (oldState?.phase !== 'finished') return;
      if (RoomManager.getConnectedPlayerCount(room) < POKER_MIN_PLAYERS) return;
      const settings = oldState.settings;
      Poker.endGame(room.code);

      room.phase = 'playing';
      Poker.createGame(room, settings);

      io.to(room.code).emit('hub:roomUpdated', room);
      drivePoker(io, room);

      console.log(`[Game] Poker rematch in ${room.code}`);
    });

    // ---- Flip 7 Events ----

    socket.on('flip7:hit', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'flip7') return;

      const result = Flip7.hit(room.code, socket.id);
      if (!result) return; // not your turn, round ending, or a double-tap
      Flip7.clearRoomTimer(room.code);

      const playerName = flip7Name(room, socket.id);
      const event: Flip7FlipEvent = {
        playerId: socket.id,
        playerName,
        card: result.card,
        result: result.result,
        flipSeven: result.flipSeven,
      };
      io.to(room.code).emit('flip7:cardFlipped', event);
      Flip7.addActivityLog(room.code, {
        playerId: socket.id,
        playerName,
        card: result.card,
        result: result.result,
        timestamp: Date.now(),
      });

      // Everyone sees the card before the next countdown starts (the next player
      // may still act early). A round-ending card gets its full reveal first.
      const revealMs = flipDisplayMs(event);
      advanceFlip7(io, room, result.turnResult, revealMs + 400, revealMs);
    });

    socket.on('flip7:stay', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'flip7') return;

      const outcome = Flip7.stay(room.code, socket.id);
      if (outcome === null) return;
      Flip7.clearRoomTimer(room.code);

      logFlip7Stay(room, socket.id, false);
      advanceFlip7(io, room, outcome, STAY_ROUND_END_DELAY_MS);
    });

    socket.on('flip7:useAction', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'flip7') return;
      if (!data || typeof data.targetId !== 'string') return;

      const result = Flip7.resolveAction(room.code, socket.id, data.targetId);
      if (!result) return;
      Flip7.clearRoomTimer(room.code);

      emitFlip7Action(io, room, result, false);
    });

    socket.on('flip7:chaosChoice', (data) => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.currentGameId !== 'flip7') return;
      if (!data || (data.choice !== 'hit' && data.choice !== 'stay')) return;

      if (!Flip7.chaosSubmit(room.code, socket.id, data.choice)) return;
      // Show everyone who has locked in (the choices stay secret until the reveal)
      broadcastFlip7State(io, room);
      resolveFlip7Chaos(io, room, false);
    });

    socket.on('flip7:nextRound', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id || room.currentGameId !== 'flip7') return;

      if (!Flip7.nextRound(room.code)) return;
      scheduleFlip7Deal(io, room);
    });

    socket.on('flip7:endGame', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id || room.currentGameId !== 'flip7') return;

      Flip7.endGame(room.code);
      clearFlip7RoomTimers(room.code);
      room.phase = 'lobby';
      room.currentGameId = null;
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    socket.on('flip7:rematch', () => {
      const room = RoomManager.getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id || room.currentGameId !== 'flip7') return;

      const oldState = Flip7.getGameState(room.code);
      if (!oldState || oldState.phase !== 'finished') return;

      clearFlip7RoomTimers(room.code);
      Flip7.rematch(room.code, room, oldState.settings);
      room.phase = 'playing';
      io.to(room.code).emit('hub:roomUpdated', room);
      scheduleFlip7Deal(io, room);

      console.log(`[Game] Flip 7 rematch in ${room.code}`);
    });

    // ---- Disconnect ----

    socket.on('disconnect', () => {
      pokerReactionTimes.delete(socket.id);
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

        if (room.currentGameId === 'poker' && Poker.getGameState(room.code)) {
          // Seat shows "away". If it's their turn, switch their clock to the
          // away grace period (auto check/fold) instead of waiting forever.
          broadcastPokerState(io, room);
          if (Poker.getActivePlayerId(room.code) === socket.id) {
            startPokerTurnTimer(io, room);
          }
        }

        if (room.currentGameId === 'flip7') {
          // Show the player as offline. If the table is waiting on them (their
          // turn, a target pick, or a chaos choice), play for them after a grace period.
          broadcastFlip7State(io, room);
          if (Flip7.isAwaitingPlayer(room.code, socket.id)) {
            armFlip7Grace(io, room, socket.id);
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
        if (result.room.currentGameId === 'flip7') {
          handleFlip7Departure(io, result.room, socketId);
        }
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

/**
 * Single entry point after any poker transition: schedule whatever comes next
 * (deal delay, runout step, next hand), broadcast, then start the turn clock.
 * Every step owns the room's one phase timer, so nothing can double-fire.
 */
function drivePoker(io: SocketIOServer, room: Room): void {
  const state = Poker.getGameState(room.code);
  if (!state) return;
  Poker.clearRoomTimer(room.code);
  Poker.clearPhaseTimer(room.code);
  state.turnTimerEnd = null;
  state.turnTimerPlayerId = null;
  const hand = state.handNumber;

  if (state.phase === 'dealing') {
    Poker.setPhaseTimer(room.code, setTimeout(() => {
      if (Poker.beginBetting(room.code, hand)) drivePoker(io, room);
    }, POKER_DEAL_MS));
  } else if (state.phase === 'roundEnd') {
    const pause = state.handResult?.uncontested ? POKER_UNCONTESTED_PAUSE_MS : POKER_SHOWDOWN_PAUSE_MS;
    state.nextHandAt = Date.now() + pause; // set before broadcasting so clients get the countdown
    Poker.setPhaseTimer(room.code, setTimeout(() => {
      const next = Poker.startNextHand(room.code, hand);
      if (next === 'stale') return;
      if (next === 'gameOver') {
        room.phase = 'finished';
        io.to(room.code).emit('hub:roomUpdated', room);
      }
      drivePoker(io, room);
    }, pause));
  } else if (state.runout) {
    Poker.setPhaseTimer(room.code, setTimeout(() => {
      if (Poker.advanceRunout(room.code, hand)) drivePoker(io, room);
    }, POKER_RUNOUT_STEP_MS));
  }

  broadcastPokerState(io, room);
  if (state.activePlayerId) startPokerTurnTimer(io, room);
}

/**
 * Turn clock for the active player. Uses the configured timer, or the away
 * grace period when the player is disconnected (even with the timer off), so
 * the table never waits forever. Pauses while nobody at all is connected.
 */
function startPokerTurnTimer(io: SocketIOServer, room: Room): void {
  Poker.clearRoomTimer(room.code);
  const state = Poker.getGameState(room.code);
  const activeId = state?.activePlayerId;
  if (!state || !activeId) return;

  const anyoneConnected = Object.values(room.players).some(p => p.connected);
  if (!anyoneConnected) return; // table is empty — resume when someone reconnects

  const player = room.players[activeId];
  const away = !player || !player.connected;
  let seconds: number | null = state.settings.turnTimer > 0 ? state.settings.turnTimer : null;
  if (away) {
    const grace = state.autoActed.has(activeId) ? POKER_AWAY_REPEAT_S : POKER_AWAY_GRACE_S;
    // Keep what's left on their clock if that's already shorter
    const remaining = state.turnTimerPlayerId === activeId && state.turnTimerEnd
      ? Math.ceil((state.turnTimerEnd - Date.now()) / 1000)
      : Infinity;
    seconds = Math.max(1, Math.min(seconds ?? Infinity, grace, remaining));
  }

  if (seconds === null) {
    state.turnTimerEnd = null;
    state.turnTimerPlayerId = null;
    io.to(room.code).emit('poker:turnTimer', null);
    return;
  }

  const total = seconds;
  const deadline = Date.now() + total * 1000;
  state.turnTimerEnd = deadline;
  state.turnTimerTotal = total;
  state.turnTimerPlayerId = activeId;

  const tick = () => {
    const current = Poker.getGameState(room.code);
    if (!current || current.turnTimerEnd !== deadline || current.activePlayerId !== activeId) {
      Poker.clearRoomTimer(room.code);
      return;
    }
    const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    io.to(room.code).emit('poker:turnTimer', { playerId: activeId, secondsLeft, total });
    if (secondsLeft <= 0) {
      Poker.clearRoomTimer(room.code);
      if (Poker.handleDisconnectedTurn(room.code, activeId, away)) drivePoker(io, room);
    }
  };

  tick(); // immediate first tick so every seat shows the clock right away
  Poker.setRoomTimer(room.code, setInterval(tick, 1000));
}

/** Player came back: swap IDs, refresh everyone's seats, and restore a fair clock. */
function handlePokerReconnect(io: SocketIOServer, room: Room, oldId: string, newId: string): void {
  Poker.swapPlayerId(room.code, oldId, newId);
  if (!Poker.getGameState(room.code)) return;
  broadcastPokerState(io, room);

  const activeId = Poker.getActivePlayerId(room.code);
  // Their turn → fresh full clock. Someone else's turn with no clock running
  // (the table was empty) → resume it.
  if (activeId && (activeId === newId || !Poker.hasRoomTimer(room.code))) {
    startPokerTurnTimer(io, room);
  } else {
    io.to(newId).emit('poker:turnTimer', Poker.getTurnTimerSnapshot(room.code));
  }
}

// ---- Flip 7 Helpers ----

// Bumped on every Flip 7 state transition so a delayed "start the next turn"
// callback from an earlier moment can tell it's stale.
const flip7TurnTokens = new Map<string, number>();

function bumpFlip7Token(roomCode: string): number {
  const token = (flip7TurnTokens.get(roomCode) ?? 0) + 1;
  flip7TurnTokens.set(roomCode, token);
  return token;
}

/** Drop every pending Flip 7 callback for a room (game ended or restarted). */
function clearFlip7RoomTimers(roomCode: string): void {
  flip7TurnTokens.delete(roomCode);
  for (const [key, timer] of disconnectGraceTimers) {
    if (key.startsWith(`${roomCode}:`)) {
      clearTimeout(timer);
      disconnectGraceTimers.delete(key);
    }
  }
}

function flip7Name(room: Room, playerId: string): string {
  return room.players[playerId]?.name || 'Unknown';
}

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

/** Show the dealing screen now, deal after the animation, then start the first turn. */
function scheduleFlip7Deal(io: SocketIOServer, room: Room): void {
  const state = Flip7.getGameState(room.code);
  if (!state) return;
  const round = state.round;
  Flip7.clearRoomTimer(room.code);
  bumpFlip7Token(room.code);
  io.to(room.code).emit('flip7:turnTimer', null);
  broadcastFlip7State(io, room);

  setTimeout(() => {
    if (Flip7.getGameState(room.code) !== state || state.round !== round) return;
    const outcome = Flip7.dealInitialCards(room.code);
    if (!outcome) return;
    advanceFlip7(io, room, outcome, STAY_ROUND_END_DELAY_MS);
  }, DEAL_ANIMATION_MS);
}

/** End the round once the last reveal has played. No-op if the game moved on meanwhile. */
function scheduleFlip7RoundEnd(io: SocketIOServer, room: Room, delayMs: number): void {
  const state = Flip7.getGameState(room.code);
  if (!state) return;
  const round = state.round;
  Flip7.clearRoomTimer(room.code);

  setTimeout(() => {
    if (Flip7.getGameState(room.code) !== state || state.round !== round) return;
    if (!Flip7.endRound(room.code)) return; // already ended by another path
    broadcastFlip7State(io, room);
  }, delayMs);
}

/**
 * Broadcast a state change and keep the game moving: schedule the round end,
 * or start the next turn (optionally after a pause so everyone sees a reveal).
 */
function advanceFlip7(
  io: SocketIOServer,
  room: Room,
  outcome: Flip7.TurnOutcome,
  roundEndDelayMs: number,
  nextTurnDelayMs = 0,
): void {
  const token = bumpFlip7Token(room.code);
  io.to(room.code).emit('flip7:turnTimer', null);
  broadcastFlip7State(io, room);

  if (outcome === 'roundEnd') {
    scheduleFlip7RoundEnd(io, room, roundEndDelayMs);
    return;
  }
  if (nextTurnDelayMs <= 0) {
    beginFlip7Turn(io, room);
    return;
  }
  setTimeout(() => {
    if (flip7TurnTokens.get(room.code) !== token) return;
    beginFlip7Turn(io, room);
  }, nextTurnDelayMs);
}

/**
 * Start the clock for whatever the table is waiting on (a Freeze / Flip Three
 * target pick, the current player's turn, or everyone's chaos choice) and arm
 * grace timers for awaited players who are offline, so a missing player can
 * never stall the game, even with the turn timer off.
 */
function beginFlip7Turn(io: SocketIOServer, room: Room): void {
  Flip7.clearRoomTimer(room.code);
  const state = Flip7.getGameState(room.code);
  if (!state || state.phase !== 'playing' || state.flipSevenAchievedBy) return;

  if (state.pendingAction) {
    const seconds = state.settings.turnTimer || ACTION_TIMEOUT_MS / 1000;
    startFlip7Countdown(io, room, seconds, () => autoResolveFlip7Action(io, room));
  } else if (state.settings.turnTimer > 0) {
    startFlip7Countdown(io, room, state.settings.turnTimer, () => {
      if (state.settings.mode === 'chaos') {
        resolveFlip7Chaos(io, room, true);
        return;
      }
      const currentId = Flip7.getCurrentPlayerId(room.code);
      if (currentId) autoStayFlip7(io, room, currentId);
    });
  }

  for (const pid of Flip7.getAwaitedPlayers(room.code)) {
    if (!room.players[pid]?.connected) armFlip7Grace(io, room, pid);
  }
}

function startFlip7Countdown(io: SocketIOServer, room: Room, seconds: number, onExpire: () => void): void {
  const state = Flip7.getGameState(room.code);
  if (!state) return;
  const end = Date.now() + seconds * 1000;
  state.turnTimerEnd = end;
  io.to(room.code).emit('flip7:turnTimer', seconds);

  const interval = setInterval(() => {
    if (Flip7.getGameState(room.code) !== state || state.phase !== 'playing') {
      clearInterval(interval);
      return;
    }
    const secondsLeft = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    io.to(room.code).emit('flip7:turnTimer', secondsLeft);
    if (secondsLeft <= 0) {
      Flip7.clearRoomTimer(room.code);
      onExpire();
    }
  }, 1000);
  Flip7.setRoomTimer(room.code, interval);
}

/** After the grace period, act for an offline player the table is still waiting on. */
function armFlip7Grace(io: SocketIOServer, room: Room, playerId: string): void {
  const key = `${room.code}:${playerId}`;
  if (disconnectGraceTimers.has(key)) return;

  const timer = setTimeout(() => {
    disconnectGraceTimers.delete(key);
    if (room.players[playerId]?.connected) return; // came back
    if (!Flip7.isAwaitingPlayer(room.code, playerId)) return; // the moment has passed
    const state = Flip7.getGameState(room.code);
    if (!state) return;

    if (state.pendingAction?.drawerId === playerId) {
      autoResolveFlip7Action(io, room);
    } else if (state.settings.mode === 'chaos') {
      if (Flip7.chaosSubmit(room.code, playerId, 'stay')) {
        broadcastFlip7State(io, room);
        resolveFlip7Chaos(io, room, false);
      }
    } else {
      autoStayFlip7(io, room, playerId);
    }
  }, DISCONNECT_GRACE_MS);
  disconnectGraceTimers.set(key, timer);
}

function logFlip7Stay(room: Room, playerId: string, auto: boolean): void {
  Flip7.addActivityLog(room.code, {
    playerId,
    playerName: flip7Name(room, playerId),
    card: null,
    result: 'stayed',
    auto,
    timestamp: Date.now(),
  });
}

/** Turn timer ran out (or the player is offline): bank their hand. */
function autoStayFlip7(io: SocketIOServer, room: Room, playerId: string): void {
  const outcome = Flip7.stay(room.code, playerId);
  if (outcome === null) return;
  Flip7.clearRoomTimer(room.code);
  logFlip7Stay(room, playerId, true);
  advanceFlip7(io, room, outcome, STAY_ROUND_END_DELAY_MS);
}

/** Broadcast a resolved Freeze / Flip Three, then move on once its animation has played. */
function emitFlip7Action(io: SocketIOServer, room: Room, result: Flip7.ActionResult, auto: boolean): void {
  const byName = flip7Name(room, result.drawerId);
  const targetName = flip7Name(room, result.targetId);
  io.to(room.code).emit('flip7:actionUsed', {
    type: result.type,
    byId: result.drawerId,
    byName,
    targetId: result.targetId,
    targetName,
    auto,
  });

  if (result.type === 'freeze') {
    Flip7.addActivityLog(room.code, {
      playerId: result.targetId,
      playerName: targetName,
      card: { type: 'action', kind: 'freeze' },
      result: 'frozen',
      timestamp: Date.now(),
    });
  }
  for (const r of result.flipThreeResults) {
    io.to(room.code).emit('flip7:cardFlipped', {
      playerId: result.targetId,
      playerName: targetName,
      card: r.card,
      result: r.result,
      flipSeven: r.flipSeven,
    });
    Flip7.addActivityLog(room.code, {
      playerId: result.targetId,
      playerName: targetName,
      card: r.card,
      result: r.result,
      timestamp: Date.now(),
    });
  }

  const animationMs = ACTION_ANIMATION_MS + FLIP_CARD_GAP_MS + flipSequenceDurationMs(result.flipThreeResults);
  advanceFlip7(io, room, result.turnResult, animationMs + 400, animationMs);
}

/** The drawer didn't pick a target in time (or went offline): pick one for them. */
function autoResolveFlip7Action(io: SocketIOServer, room: Room): void {
  const outcome = Flip7.autoResolveAction(room.code);
  if (!outcome) return;
  Flip7.clearRoomTimer(room.code);
  if (outcome.kind === 'resolved') {
    emitFlip7Action(io, room, outcome.result, true);
  } else {
    advanceFlip7(io, room, outcome.turnResult, STAY_ROUND_END_DELAY_MS);
  }
}

/**
 * Resolve a chaos tick once everyone has locked in. With `force` (timer
 * expiry), anyone who hasn't chosen is locked in as 'stay'.
 */
function resolveFlip7Chaos(io: SocketIOServer, room: Room, force: boolean): void {
  const forced = new Set(force ? Flip7.forceChaosStays(room.code) : []);
  if (!Flip7.allChaosChoicesIn(room.code)) return;
  const chaos = Flip7.resolveChaos(room.code);
  if (!chaos) return;
  Flip7.clearRoomTimer(room.code);

  const flips: Flip7FlipEvent[] = [];
  for (const r of chaos.results) {
    const playerName = flip7Name(room, r.playerId);
    if (r.choice === 'stay' || !r.card || !r.result) {
      logFlip7Stay(room, r.playerId, forced.has(r.playerId));
      continue;
    }
    flips.push({ playerId: r.playerId, playerName, card: r.card, result: r.result, flipSeven: r.flipSeven ?? false });
    Flip7.addActivityLog(room.code, {
      playerId: r.playerId,
      playerName,
      card: r.card,
      result: r.result,
      timestamp: Date.now(),
    });
  }
  if (flips.length > 0) io.to(room.code).emit('flip7:chaosFlips', flips);

  // Everyone sees the reveal before making the next choice (or seeing the summary)
  const revealMs = flips.length > 0 ? chaosBatchDurationMs(flips) + 300 : 0;
  advanceFlip7(io, room, chaos.turnResult, Math.max(STAY_ROUND_END_DELAY_MS, revealMs + 400), revealMs);
}

/** A player left for good (Leave button or zombie cleanup). They sit out the rest of the game. */
function handleFlip7Departure(io: SocketIOServer, room: Room, playerId: string): void {
  const graceKey = `${room.code}:${playerId}`;
  const graceTimer = disconnectGraceTimers.get(graceKey);
  if (graceTimer) {
    clearTimeout(graceTimer);
    disconnectGraceTimers.delete(graceKey);
  }

  const outcome = Flip7.markDeparted(room.code, playerId);
  if (outcome === null) return;
  if (outcome === 'none') {
    broadcastFlip7State(io, room);
    return;
  }
  if (outcome === 'continue' && Flip7.getGameState(room.code)?.settings.mode === 'chaos') {
    // Their choice no longer counts. Everyone left may now be locked in.
    broadcastFlip7State(io, room);
    resolveFlip7Chaos(io, room, false);
    return;
  }
  Flip7.clearRoomTimer(room.code);
  advanceFlip7(io, room, outcome, STAY_ROUND_END_DELAY_MS);
}
