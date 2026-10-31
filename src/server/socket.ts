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
import * as ReadTheRoom from './games/read-the-room/ReadTheRoomGame';
import { MAX_STORY_LENGTH, MIN_TEAM_SIZE, STORY_REVEAL_MS } from '@/types/games/story-thief';
import { type ReadTheRoomSettings, RTR_HOLD_IDLE_MS, RTR_MIN_TEAM_SIZE } from '@/types/games/read-the-room';
import {
  type LiarsDiceSettings,
  LIARS_DICE_MIN_PLAYERS,
  LIARS_DICE_MAX_PLAYERS,
  LD_ROLL_MS,
  LD_REVEAL_MS,
  LD_ROUND_END_MS,
  LD_AWAY_GRACE_S,
} from '@/types/games/liars-dice';
import {
  type BattleshipSettings,
  BATTLESHIP_MIN_PLAYERS,
  BATTLESHIP_MAX_PLAYERS,
  BS_TURN_END_DELAY_MS,
  BS_AUTO_TURN_END_DELAY_MS,
  BS_AWAY_GRACE_S,
} from '@/types/games/battleship';
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
// Grace period timers for disconnected players (Flip 7)
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
      const { room } = RoomManager.createRoom(socket.id, name, readDeviceToken(data.token));
      socket.join(room.code);
      callback({ success: true, room, playerId: socket.id });
      console.log(`[Room] Created ${room.code} by ${name}`);
    });

    socket.on('hub:joinRoom', (data, callback) => {
      const name = (data.playerName || '').trim().slice(0, 20);
      const code = (data.code || '').trim().toUpperCase().slice(0, 4);
      if (!name) { callback({ success: false, error: 'Name is required' }); return; }
      if (!code) { callback({ success: false, error: 'Room code is required' }); return; }
      const result = RoomManager.joinRoom(code, socket.id, name, readDeviceToken(data.token));
      if ('error' in result) {
        callback({ success: false, error: result.error });
        return;
      }

      socket.join(result.room.code);
      callback({ success: true, room: result.room, playerId: socket.id });
      if (result.kind === 'alreadyIn') return;

      if (result.kind === 'reconnected') {
        // The old connection only looked alive (the phone noticed the drop first): close it.
        // Its disconnect event finds no seat under the old ID and changes nothing.
        if (result.replacedLiveSocket) io.sockets.sockets.get(result.oldId)?.disconnect(true);

        // Reconnecting player — swap IDs in game state and send current state
        console.log(`[Room] ${data.playerName} reconnected to ${data.code}`);
        if (result.room.currentGameId === 'story-thief') {
          StoryThief.swapPlayerId(result.room.code, result.oldId, socket.id);
          // Everyone needs the new ID (suspect lists, votes), and a waiting round may now start
          progressStoryThief(io, result.room);
        }
        if (result.room.currentGameId === 'liars-dice') {
          handleLiarsDiceReconnect(io, result.room, result.oldId, socket.id);
        }
        if (result.room.currentGameId === 'battleship') {
          handleBattleshipReconnect(io, result.room, result.oldId, socket.id);
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
          resumeFlip7IfPaused(io, result.room);
        }
        if (result.room.currentGameId === 'read-the-room') {
          ReadTheRoom.swapPlayerId(result.room.code, result.oldId, socket.id);
          // Everyone needs the new ID, and a clue or a waiting game may move on now
          progressReadTheRoom(io, result.room);
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
        handleGameDeparture(io, result.room, socket.id);
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
      // Games start from the lobby only (rematches have their own events)
      if (room.phase !== 'lobby') return;

      if (gameId === 'story-thief') {
        const tooSmall = StoryThief.teamsTooSmall(room);
        if (tooSmall.length > 0) {
          socket.emit('hub:error', `Each team needs at least ${MIN_TEAM_SIZE} players (${tooSmall.join(', ')})`);
          return;
        }
        room.currentGameId = 'story-thief';
        room.selectedGameId = 'story-thief';
        room.phase = 'playing';
        StoryThief.createGame(room);

        io.to(room.code).emit('hub:roomUpdated', room);
        broadcastStoryThiefState(io, room);
        console.log(`[Game] Whose Truth? started in ${room.code}`);
      }

      if (gameId === 'liars-dice') {
        const seated = RoomManager.getConnectedPlayerCount(room);
        if (seated < LIARS_DICE_MIN_PLAYERS || seated > LIARS_DICE_MAX_PLAYERS) return;
        room.currentGameId = 'liars-dice';
        room.selectedGameId = 'liars-dice';
        room.phase = 'playing';
        LiarsDice.createGame(room, gameSettings as Partial<LiarsDiceSettings>);

        io.to(room.code).emit('hub:roomUpdated', room);
        driveLiarsDice(io, room);
        console.log(`[Game] Liar's Dice started in ${room.code}`);
      }

      if (gameId === 'battleship') {
        const seated = RoomManager.getConnectedPlayerCount(room);
        if (seated < BATTLESHIP_MIN_PLAYERS || seated > BATTLESHIP_MAX_PLAYERS) return;
        room.currentGameId = 'battleship';
        room.selectedGameId = 'battleship';
        room.phase = 'playing';
        Battleship.createGame(room, gameSettings as Partial<BattleshipSettings>);

        io.to(room.code).emit('hub:roomUpdated', room);
        broadcastBattleshipState(io, room);
        startBattleshipPlacementClock(io, room);
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

      if (gameId === 'read-the-room') {
        const short = ReadTheRoom.unplayableTeams(room);
        if (short.length > 0) {
          socket.emit('hub:error', `Each team needs at least ${RTR_MIN_TEAM_SIZE} players online (${short.join(', ')})`);
          return;
        }
        room.currentGameId = 'read-the-room';
        room.selectedGameId = 'read-the-room';
        room.phase = 'playing';
        ReadTheRoom.createGame(room, gameSettings as Partial<ReadTheRoomSettings>);

        io.to(room.code).emit('hub:roomUpdated', room);
        driveReadTheRoom(io, room);
        console.log(`[Game] Read the Room started in ${room.code}`);
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
          socket.emit('liars-dice:turnTimer', LiarsDice.getTurnTimerSnapshot(room.code));
        }
      }
      if (room.currentGameId === 'battleship') {
        const clientState = Battleship.getClientState(room.code, socket.id, room);
        if (clientState) {
          socket.emit('battleship:stateUpdated', clientState);
          socket.emit('battleship:turnTimer', Battleship.getTurnTimerSnapshot(room.code));
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
      if (room.currentGameId === 'read-the-room') {
        // The state carries the dial and a snapshot of any running countdown
        const clientState = ReadTheRoom.getClientState(room.code, socket.id, room);
        if (clientState) socket.emit('read-the-room:stateUpdated', clientState);
      }
      console.log(`[Socket] State refresh for ${socket.id}`);
    });

    // ---- Whose Truth? (story-thief) Events ----

    socket.on('story-thief:submitStory', (data) => {
      const room = storyThiefRoom(socket.id);
      if (!room) return;
      const text = String(data?.text ?? '').trim().slice(0, MAX_STORY_LENGTH);
      if (!text) return;
      if (!StoryThief.submitStory(room.code, socket.id, text, room)) {
        // Still tell the sender, so their "Sending…" state clears
        emitStoryThiefState(io, room, socket.id);
        return;
      }
      // Starts the round once setup is complete, or once an owed story arrives
      progressStoryThief(io, room);
    });

    socket.on('story-thief:endQuestionPhase', () => {
      const room = storyThiefRoom(socket.id);
      if (!room || !StoryThief.canEndQuestions(room.code, room, socket.id)) return;
      startStoryThiefVoting(io, room);
    });

    socket.on('story-thief:submitVote', (data) => {
      const room = storyThiefRoom(socket.id);
      if (!room) return;
      const suspectId = String(data?.suspectId ?? '');
      if (!StoryThief.submitVote(room.code, socket.id, suspectId, room)) {
        emitStoryThiefState(io, room, socket.id);
        return;
      }
      // Everyone sees the vote count go up; the last vote reveals the author
      progressStoryThief(io, room);
    });

    socket.on('story-thief:forceReveal', () => {
      const room = storyThiefRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (StoryThief.getGameState(room.code)?.phase !== 'voting' || StoryThief.voteCount(room.code) === 0) return;
      resolveStoryThiefVotes(io, room);
    });

    socket.on('story-thief:nextRound', () => {
      const room = storyThiefRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (!StoryThief.advanceToNextRound(room.code, room)) return;
      beginStoryThiefRound(io, room);
    });

    socket.on('story-thief:endGame', () => {
      const room = storyThiefRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;

      // Summary screen → back to the lobby. Keep selectedGameId so the lobby remembers the game.
      if (StoryThief.getGameState(room.code)?.phase === 'finished') {
        StoryThief.cleanupGame(room.code);
        room.phase = 'lobby';
        room.currentGameId = null;
        io.to(room.code).emit('hub:roomUpdated', room);
        return;
      }

      // Mid-game: show the summary first
      StoryThief.endGame(room.code);
      room.phase = 'finished';
      broadcastStoryThiefState(io, room);
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    // ---- Liar's Dice Events ----

    socket.on('liars-dice:rollComplete', () => {
      const room = liarsDiceRoom(socket.id);
      if (!room || !LiarsDice.markRollComplete(room.code, socket.id)) return;

      if (LiarsDice.allRollsComplete(room.code, room) && LiarsDice.startBidding(room.code)) {
        driveLiarsDice(io, room);
      } else {
        broadcastLiarsDiceState(io, room); // everyone sees who has rolled
      }
    });

    socket.on('liars-dice:placeBid', (data) => {
      const room = liarsDiceRoom(socket.id);
      if (!room) return;

      const result = LiarsDice.placeBid(room.code, socket.id, Number(data?.quantity), Number(data?.faceValue), room);
      if (!result.success) {
        socket.emit('hub:error', result.error || 'Invalid bid');
        emitLiarsDiceState(io, room, socket.id); // unlocks the sender's controls
        return;
      }
      driveLiarsDice(io, room);
    });

    const onChallenge = (type: 'liar' | 'spotOn') => {
      const room = liarsDiceRoom(socket.id);
      if (!room) return;

      const result = LiarsDice.challenge(room.code, socket.id, type, room);
      if ('error' in result) {
        socket.emit('hub:error', result.error);
        emitLiarsDiceState(io, room, socket.id);
        return;
      }
      driveLiarsDice(io, room);
    };
    socket.on('liars-dice:callLiar', () => onChallenge('liar'));
    socket.on('liars-dice:callSpotOn', () => onChallenge('spotOn'));

    socket.on('liars-dice:endGame', () => {
      const room = liarsDiceRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;

      LiarsDice.endGame(room.code);
      room.phase = 'lobby';
      room.currentGameId = null;
      // Keep selectedGameId so lobby remembers the last game played
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    socket.on('liars-dice:rematch', () => {
      const room = liarsDiceRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;
      const oldState = LiarsDice.getGameState(room.code);
      if (oldState?.phase !== 'finished') return;

      const seated = RoomManager.getConnectedPlayerCount(room);
      if (seated < LIARS_DICE_MIN_PLAYERS || seated > LIARS_DICE_MAX_PLAYERS) {
        socket.emit('hub:error', `Liar's Dice needs ${LIARS_DICE_MIN_PLAYERS}–${LIARS_DICE_MAX_PLAYERS} players online`);
        return;
      }

      const settings = oldState.settings;
      LiarsDice.endGame(room.code);
      room.phase = 'playing';
      LiarsDice.createGame(room, settings);

      io.to(room.code).emit('hub:roomUpdated', room);
      driveLiarsDice(io, room);
      console.log(`[Game] Liar's Dice rematch in ${room.code}`);
    });

    // ---- Battleship Events ----

    socket.on('battleship:placeShips', (data) => {
      const room = battleshipRoom(socket.id);
      if (!room) return;

      const result = Battleship.placeShips(room.code, socket.id, Array.isArray(data?.placements) ? data.placements : []);
      if (!result.success) {
        socket.emit('hub:error', result.error || 'Invalid placement');
        emitBattleshipState(io, room, socket.id);
        return;
      }

      if (Battleship.allPlayersReady(room.code, room) && Battleship.startBattle(room.code)) {
        driveBattleship(io, room);
      } else {
        broadcastBattleshipState(io, room); // everyone sees who's ready
      }
    });

    socket.on('battleship:fire', (data) => {
      const room = battleshipRoom(socket.id);
      if (!room) return;

      const result = Battleship.fireShot(room.code, socket.id, String(data?.targetId ?? ''), data?.coordinate, room);
      if (!result.success || !result.shot) {
        socket.emit('hub:error', result.error || 'Invalid shot');
        emitBattleshipState(io, room, socket.id);
        return;
      }
      io.to(room.code).emit('battleship:shotResult', result.shot);

      if (Battleship.getGameState(room.code)?.phase === 'finished') {
        driveBattleship(io, room);
        return;
      }
      if (Battleship.getShotsRemainingForTurn(room.code, socket.id) === 0) {
        // Out of shots: stop the clock, let everyone see the last shot land, then pass the turn
        Battleship.clearTurnTimer(room.code);
        io.to(room.code).emit('battleship:turnTimer', null);
        scheduleBattleshipTurnEnd(io, room, BS_TURN_END_DELAY_MS);
      }
      broadcastBattleshipState(io, room);
    });

    socket.on('battleship:sonarPing', (data) => {
      const room = battleshipRoom(socket.id);
      if (!room) return;

      const result = Battleship.pingSonar(room.code, socket.id, String(data?.targetId ?? ''), data?.topLeft);
      if (!result.success) socket.emit('hub:error', result.error || 'Sonar failed');
      // The scan result is private: only the player who pinged gets it
      emitBattleshipState(io, room, socket.id);
    });

    socket.on('battleship:endGame', () => {
      const room = battleshipRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;

      Battleship.endGame(room.code);
      room.phase = 'lobby';
      room.currentGameId = null;
      io.to(room.code).emit('hub:roomUpdated', room);
    });

    socket.on('battleship:rematch', () => {
      const room = battleshipRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;
      const oldState = Battleship.getGameState(room.code);
      if (oldState?.phase !== 'finished') return;

      const seated = RoomManager.getConnectedPlayerCount(room);
      if (seated < BATTLESHIP_MIN_PLAYERS || seated > BATTLESHIP_MAX_PLAYERS) {
        socket.emit('hub:error', `Battleship needs ${BATTLESHIP_MIN_PLAYERS}–${BATTLESHIP_MAX_PLAYERS} players online`);
        return;
      }

      const settings = oldState.settings;
      Battleship.endGame(room.code);

      room.phase = 'playing';
      Battleship.createGame(room, settings);

      io.to(room.code).emit('hub:roomUpdated', room);
      broadcastBattleshipState(io, room);
      startBattleshipPlacementClock(io, room);
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

    // ---- Read the Room Events ----

    socket.on('read-the-room:giveClue', (data) => {
      const room = readTheRoomRoom(socket.id);
      if (!room) return;
      const pairId = typeof data?.pairId === 'number' ? data.pairId : NaN;
      const result = ReadTheRoom.giveClue(room.code, room, socket.id, pairId, String(data?.clue ?? ''));
      if ('error' in result) {
        socket.emit('hub:error', result.error);
        emitReadTheRoomState(io, room, socket.id); // unlocks the sender's button; their typed clue stays
        return;
      }
      driveReadTheRoom(io, room);
    });

    // High-frequency: relayed straight to the room without a full state broadcast
    socket.on('read-the-room:dialMove', (data) => {
      const room = readTheRoomRoom(socket.id);
      if (!room) return;
      // Only real numbers count (Number(null) would be 0)
      const position = typeof data?.position === 'number' ? data.position : NaN;
      const dial = ReadTheRoom.moveDial(room.code, room, socket.id, position, Date.now());
      if (!dial) return; // not a Guesser, too fast, or someone else holds the dial
      socket.to(room.code).volatile.emit('read-the-room:dial', dial);
      const holderId = socket.id;
      ReadTheRoom.setHoldTimer(room.code, setTimeout(() => {
        const released = ReadTheRoom.expireHold(room.code, holderId, Date.now());
        if (released) io.to(room.code).emit('read-the-room:dial', released);
      }, RTR_HOLD_IDLE_MS));
    });

    socket.on('read-the-room:dialRelease', (data) => {
      const room = readTheRoomRoom(socket.id);
      if (!room) return;
      const position = typeof data?.position === 'number' ? data.position : NaN;
      const dial = ReadTheRoom.releaseDial(room.code, room, socket.id, position, Date.now());
      if (!dial) return;
      ReadTheRoom.clearHoldTimer(room.code);
      io.to(room.code).emit('read-the-room:dial', dial);
    });

    socket.on('read-the-room:lockIn', () => {
      const room = readTheRoomRoom(socket.id);
      if (!room) return;
      if (!ReadTheRoom.lockIn(room.code, room, socket.id)) {
        emitReadTheRoomState(io, room, socket.id);
        return;
      }
      ReadTheRoom.clearHoldTimer(room.code);
      driveReadTheRoom(io, room);
    });

    socket.on('read-the-room:pickCall', (data) => {
      const room = readTheRoomRoom(socket.id);
      if (!room) return;
      const side = data?.side === 'left' || data?.side === 'right' ? data.side : null;
      if (!side || !ReadTheRoom.pickCall(room.code, room, socket.id, side)) return;
      broadcastReadTheRoomState(io, room); // teammates see the pick; the call clock keeps running
    });

    socket.on('read-the-room:lockCall', () => {
      const room = readTheRoomRoom(socket.id);
      if (!room) return;
      if (!ReadTheRoom.lockCall(room.code, room, socket.id)) {
        emitReadTheRoomState(io, room, socket.id);
        return;
      }
      driveReadTheRoom(io, room); // reveals once every calling team has locked in
    });

    socket.on('read-the-room:skipClueGiver', () => {
      const room = readTheRoomRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (ReadTheRoom.skipClueGiver(room.code, room)) driveReadTheRoom(io, room);
    });

    socket.on('read-the-room:nextRound', () => {
      const room = readTheRoomRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (ReadTheRoom.nextRound(room.code, room, Date.now())) driveReadTheRoom(io, room);
    });

    socket.on('read-the-room:endGame', () => {
      const room = readTheRoomRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;

      // Summary screen → back to the lobby. Keep selectedGameId so the lobby remembers the game.
      if (ReadTheRoom.getGameState(room.code)?.phase === 'finished') {
        ReadTheRoom.cleanupGame(room.code);
        room.phase = 'lobby';
        room.currentGameId = null;
        io.to(room.code).emit('hub:roomUpdated', room);
        return;
      }

      // Mid-game: show the summary first
      if (ReadTheRoom.endGame(room.code)) driveReadTheRoom(io, room);
    });

    socket.on('read-the-room:rematch', () => {
      const room = readTheRoomRoom(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (ReadTheRoom.getGameState(room.code)?.phase !== 'finished') return;

      const short = ReadTheRoom.unplayableTeams(room);
      if (short.length > 0) {
        socket.emit('hub:error', `Each team needs at least ${RTR_MIN_TEAM_SIZE} players online (${short.join(', ')})`);
        return;
      }
      if (!ReadTheRoom.rematch(room.code, room)) return;
      room.phase = 'playing';
      io.to(room.code).emit('hub:roomUpdated', room);
      driveReadTheRoom(io, room);
      console.log(`[Game] Read the Room rematch in ${room.code}`);
    });

    // ---- Disconnect ----

    socket.on('disconnect', () => {
      pokerReactionTimes.delete(socket.id);
      const room = RoomManager.markDisconnected(socket.id);
      if (room) {
        io.to(room.code).emit('hub:roomUpdated', room);

        // If game is active, handle phase-specific disconnect logic
        if (room.currentGameId === 'story-thief') {
          // Offline players don't hold up setup, the vote, or a round waiting for a story.
          // A story they owe stays owed: they're asked again when they come back.
          progressStoryThief(io, room);
        }

        if (room.currentGameId === 'liars-dice') {
          handleLiarsDiceDisconnect(io, room, socket.id);
        }

        if (room.currentGameId === 'battleship') {
          handleBattleshipDisconnect(io, room, socket.id);
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

        if (room.currentGameId === 'read-the-room') {
          // Shows them away, lets go of the dial, and starts a grace period if the round waits on them
          progressReadTheRoom(io, room);
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
      // Clear any Flip 7 grace timer for this zombie
      for (const [key, timer] of disconnectGraceTimers) {
        if (key.endsWith(`:${socketId}`)) {
          clearTimeout(timer);
          disconnectGraceTimers.delete(key);
        }
      }

      const result = RoomManager.removeDisconnectedPlayer(socketId);
      if (result) {
        io.to(result.roomCode).emit('hub:roomUpdated', result.room);
        handleGameDeparture(io, result.room, socketId);
      }
    }

    // Read the Room: drop pair history and game state of rooms that are gone
    ReadTheRoom.pruneRooms(RoomManager.getRoom);
  }, 60 * 1000);

  return io;
}

/** A player left the room for good (Leave button or zombie cleanup) while a game was running. */
function handleGameDeparture(io: SocketIOServer, room: Room, playerId: string): void {
  if (room.currentGameId === 'story-thief') progressStoryThief(io, room);
  if (room.currentGameId === 'liars-dice') handleLiarsDiceDeparture(io, room, playerId);
  if (room.currentGameId === 'battleship') handleBattleshipDeparture(io, room, playerId);
  if (room.currentGameId === 'poker') handlePokerDeparture(io, room, playerId);
  if (room.currentGameId === 'flip7') handleFlip7Departure(io, room, playerId);
  if (room.currentGameId === 'read-the-room') handleReadTheRoomDeparture(io, room, playerId);
}

/** Device token sent by the browser (random, kept in localStorage). Anything else counts as none. */
function readDeviceToken(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
}

function anyoneOnline(room: Room): boolean {
  return Object.values(room.players).some(p => p.connected);
}

// ---- Whose Truth? (story-thief) Helpers ----

/** The sender's room, if it's playing Whose Truth? right now. */
function storyThiefRoom(socketId: string): Room | null {
  const room = RoomManager.getRoomByPlayer(socketId);
  if (!room || room.currentGameId !== 'story-thief' || !StoryThief.getGameState(room.code)) return null;
  return room;
}

function emitStoryThiefState(io: SocketIOServer, room: Room, playerId: string): void {
  const clientState = StoryThief.getClientState(room.code, playerId, room);
  if (clientState) io.to(playerId).emit('story-thief:stateUpdated', clientState);
}

function broadcastStoryThiefState(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) emitStoryThiefState(io, room, pid);
  }
}

/**
 * Re-check whatever the game is waiting on after anything changes (a story, a vote,
 * a disconnect, a reconnect, someone leaving), then broadcast. Nothing advances while
 * nobody is connected, so a table of sleeping phones doesn't play itself.
 */
function progressStoryThief(io: SocketIOServer, room: Room): void {
  const state = StoryThief.getGameState(room.code);
  if (!state || room.currentGameId !== 'story-thief') return;

  if (Object.values(room.players).some(p => p.connected)) {
    if (state.phase === 'setup' && StoryThief.allPlayersSubmitted(room.code, room)) {
      beginStoryThiefRound(io, room);
      return;
    }
    if (state.phase === 'voting' && StoryThief.allVotesIn(room.code, room)) {
      resolveStoryThiefVotes(io, room);
      return;
    }
    if (StoryThief.isWaitingForStory(room.code)) {
      beginStoryThiefRound(io, room);
      return;
    }
  }
  broadcastStoryThiefState(io, room);
}

/** Pull the next story; questioning starts once everyone has seen it. */
function beginStoryThiefRound(io: SocketIOServer, room: Room): void {
  const outcome = StoryThief.startRound(room.code, room);
  broadcastStoryThiefState(io, room);
  if (outcome !== 'started') return; // waiting for a story or for players: the screen says who

  const state = StoryThief.getGameState(room.code);
  if (!state) return;
  const round = state.roundNumber;
  setTimeout(() => {
    if (StoryThief.getGameState(room.code) !== state || state.roundNumber !== round) return;
    if (!StoryThief.moveToQuestioning(room.code, room)) return;
    broadcastStoryThiefState(io, room);
    if (state.timerEndTime) startStoryThiefTimer(io, room);
  }, STORY_REVEAL_MS);
}

function startStoryThiefVoting(io: SocketIOServer, room: Room): void {
  if (!StoryThief.moveToVoting(room.code)) return;
  // Resolves straight away if every guesser is offline
  progressStoryThief(io, room);
}

function resolveStoryThiefVotes(io: SocketIOServer, room: Room): void {
  if (!StoryThief.calculateResults(room.code, room)) return;
  broadcastStoryThiefState(io, room);
}

/** Questioning countdown (timed mode). Voting starts when it runs out. */
function startStoryThiefTimer(io: SocketIOServer, room: Room): void {
  const state = StoryThief.getGameState(room.code);
  const end = state?.timerEndTime;
  if (!state || !end) return;

  const interval = setInterval(() => {
    if (StoryThief.getGameState(room.code) !== state || state.phase !== 'questioning' || state.timerEndTime !== end) {
      clearInterval(interval);
      return;
    }
    const secondsLeft = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    io.to(room.code).emit('story-thief:timerTick', secondsLeft);
    if (secondsLeft <= 0) {
      StoryThief.clearRoomTimer(room.code);
      startStoryThiefVoting(io, room);
    }
  }, 1000);
  StoryThief.setRoomTimer(room.code, interval);
}

// ---- Liar's Dice Helpers ----

/** The sender's room, if it's playing Liar's Dice right now. */
function liarsDiceRoom(socketId: string): Room | null {
  const room = RoomManager.getRoomByPlayer(socketId);
  if (!room || room.currentGameId !== 'liars-dice' || !LiarsDice.getGameState(room.code)) return null;
  return room;
}

function emitLiarsDiceState(io: SocketIOServer, room: Room, playerId: string): void {
  const clientState = LiarsDice.getClientState(room.code, playerId, room);
  if (clientState) io.to(playerId).emit('liars-dice:stateUpdated', clientState);
}

function broadcastLiarsDiceState(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) emitLiarsDiceState(io, room, pid);
  }
}

/**
 * Single entry point after every Liar's Dice transition: schedule the phase's next step
 * (rolling → bidding, reveal → lives, round end → next roll), broadcast, then start the
 * turn clock. One phase step and one turn clock per room, and each step checks it still
 * belongs to the same game and round, so a stale timer can't fire into a later round.
 */
function driveLiarsDice(io: SocketIOServer, room: Room): void {
  const state = LiarsDice.getGameState(room.code);
  if (!state) return;
  LiarsDice.clearPhaseTimer(room.code);
  LiarsDice.clearTurnTimer(room.code);
  state.turnTimerEnd = null;
  state.turnTimerPlayerId = null;

  const round = state.roundNumber;
  const after = (ms: number, step: () => boolean) => {
    LiarsDice.setPhaseTimer(room.code, setTimeout(() => {
      LiarsDice.clearPhaseTimer(room.code); // this timeout is the registered one: drop the entry
      if (LiarsDice.getGameState(room.code) !== state || state.roundNumber !== round) return;
      if (step()) driveLiarsDice(io, room);
    }, ms));
  };

  if (state.phase === 'rolling') {
    after(LD_ROLL_MS, () => LiarsDice.startBidding(room.code));
  } else if (state.phase === 'challenge') {
    after(LD_REVEAL_MS, () => LiarsDice.applyChallenge(room.code));
  } else if (state.phase === 'roundEnd') {
    after(LD_ROUND_END_MS, () => LiarsDice.startNewRound(room.code));
  } else if (state.phase === 'finished' && room.phase !== 'finished') {
    room.phase = 'finished';
    io.to(room.code).emit('hub:roomUpdated', room);
  }

  broadcastLiarsDiceState(io, room);
  if (state.phase === 'bidding') startLiarsDiceTurnClock(io, room);
  else io.to(room.code).emit('liars-dice:turnTimer', null);
}

/**
 * Clock for the player whose turn it is: the configured turn timer, or the away grace
 * period if they're offline (even with the timer off), so the table never waits forever.
 * When it runs out the server plays the turn for them. Paused while nobody is connected.
 */
function startLiarsDiceTurnClock(io: SocketIOServer, room: Room): void {
  LiarsDice.clearTurnTimer(room.code);
  const state = LiarsDice.getGameState(room.code);
  const activeId = state?.activePlayerId;
  if (!state || state.phase !== 'bidding' || !activeId || !Object.values(room.players).some(p => p.connected)) {
    if (state) {
      state.turnTimerEnd = null;
      state.turnTimerPlayerId = null;
    }
    io.to(room.code).emit('liars-dice:turnTimer', null);
    return;
  }

  const away = !room.players[activeId]?.connected;
  let seconds: number | null = state.settings.turnTimer > 0 ? state.settings.turnTimer : null;
  if (away) {
    // Keep what's left on their clock if that's already shorter
    const remaining = state.turnTimerPlayerId === activeId && state.turnTimerEnd
      ? Math.ceil((state.turnTimerEnd - Date.now()) / 1000)
      : Infinity;
    seconds = Math.max(1, Math.min(seconds ?? Infinity, LD_AWAY_GRACE_S, remaining));
  }
  if (seconds === null) {
    state.turnTimerEnd = null;
    state.turnTimerPlayerId = null;
    io.to(room.code).emit('liars-dice:turnTimer', null);
    return;
  }

  const total = seconds;
  const deadline = Date.now() + total * 1000;
  state.turnTimerEnd = deadline;
  state.turnTimerTotal = total;
  state.turnTimerPlayerId = activeId;

  const interval = setInterval(() => tick(), 1000);
  const tick = () => {
    if (LiarsDice.getGameState(room.code) !== state || state.phase !== 'bidding'
      || state.activePlayerId !== activeId || state.turnTimerEnd !== deadline) {
      clearInterval(interval);
      return;
    }
    const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    io.to(room.code).emit('liars-dice:turnTimer', { playerId: activeId, secondsLeft, total });
    if (secondsLeft <= 0) {
      LiarsDice.clearTurnTimer(room.code);
      if (LiarsDice.autoPlay(room.code, room)) driveLiarsDice(io, room);
    }
  };
  LiarsDice.setTurnTimer(room.code, interval);
  tick(); // everyone sees the clock straight away
}

/** Player came back: swap IDs, refresh everyone, and give them a fair clock if it's their turn. */
function handleLiarsDiceReconnect(io: SocketIOServer, room: Room, oldId: string, newId: string): void {
  LiarsDice.swapPlayerId(room.code, oldId, newId);
  const state = LiarsDice.getGameState(room.code);
  if (!state) return;
  broadcastLiarsDiceState(io, room);

  if (state.phase === 'bidding' && (state.activePlayerId === newId || !LiarsDice.hasTurnTimer(room.code))) {
    startLiarsDiceTurnClock(io, room);
  } else {
    io.to(newId).emit('liars-dice:turnTimer', LiarsDice.getTurnTimerSnapshot(room.code));
  }
}

function handleLiarsDiceDisconnect(io: SocketIOServer, room: Room, playerId: string): void {
  const state = LiarsDice.getGameState(room.code);
  if (!state) return;

  if (state.phase === 'rolling' && LiarsDice.allRollsComplete(room.code, room) && LiarsDice.startBidding(room.code)) {
    driveLiarsDice(io, room);
    return;
  }
  broadcastLiarsDiceState(io, room); // their seat shows "away"
  // Their turn: switch to the away grace period. Nobody left online: pause the clock.
  const nobodyOnline = !Object.values(room.players).some(p => p.connected);
  if (state.phase === 'bidding' && (state.activePlayerId === playerId || nobodyOnline)) {
    startLiarsDiceTurnClock(io, room);
  }
}

/** A player left for good: they're out. The game ends if one player is left. */
function handleLiarsDiceDeparture(io: SocketIOServer, room: Room, playerId: string): void {
  if (!LiarsDice.removePlayer(room.code, playerId)) return;
  const state = LiarsDice.getGameState(room.code);
  if (state?.phase === 'rolling' && LiarsDice.allRollsComplete(room.code, room)) LiarsDice.startBidding(room.code);
  driveLiarsDice(io, room);
}


// ---- Battleship Helpers ----

/** The sender's room, if it's playing Battleship right now. */
function battleshipRoom(socketId: string): Room | null {
  const room = RoomManager.getRoomByPlayer(socketId);
  if (!room || room.currentGameId !== 'battleship' || !Battleship.getGameState(room.code)) return null;
  return room;
}

function emitBattleshipState(io: SocketIOServer, room: Room, playerId: string): void {
  const clientState = Battleship.getClientState(room.code, playerId, room);
  if (clientState) io.to(playerId).emit('battleship:stateUpdated', clientState);
}

function broadcastBattleshipState(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) emitBattleshipState(io, room, pid);
  }
}

/** After a turn change or the battle starting/ending: broadcast and run the right clock. */
function driveBattleship(io: SocketIOServer, room: Room): void {
  const state = Battleship.getGameState(room.code);
  if (!state) return;
  Battleship.clearTurnTimer(room.code);
  Battleship.clearPhaseTimer(room.code);

  if (state.phase === 'finished' && room.phase !== 'finished') {
    room.phase = 'finished';
    io.to(room.code).emit('hub:roomUpdated', room);
  }
  broadcastBattleshipState(io, room);
  if (state.phase === 'battle') startBattleshipTurnClock(io, room);
  else io.to(room.code).emit('battleship:turnTimer', null);
}

/** Pass the turn after a short pause, unless the game moved on meanwhile. */
function scheduleBattleshipTurnEnd(io: SocketIOServer, room: Room, delayMs: number): void {
  const state = Battleship.getGameState(room.code);
  if (!state) return;
  const turn = state.turnNumber;
  Battleship.setPhaseTimer(room.code, setTimeout(() => {
    Battleship.clearPhaseTimer(room.code); // this timeout is the registered one: drop the entry
    if (Battleship.getGameState(room.code) !== state || state.phase !== 'battle' || state.turnNumber !== turn) return;
    if (Battleship.endTurn(room.code, room)) driveBattleship(io, room);
  }, delayMs));
}

/**
 * Clock for the player whose turn it is: the configured turn timer, or the away grace
 * period if they're offline (even with the timer off). When it runs out their remaining
 * shots are fired at random. Paused while nobody is connected.
 */
function startBattleshipTurnClock(io: SocketIOServer, room: Room): void {
  Battleship.clearTurnTimer(room.code);
  const state = Battleship.getGameState(room.code);
  const activeId = state?.activePlayerId;
  const idle = !state || state.phase !== 'battle' || !activeId
    || Battleship.hasPhaseTimer(room.code)                       // turn already ending
    || Battleship.getShotsRemainingForTurn(room.code, activeId) === 0
    || !Object.values(room.players).some(p => p.connected);
  if (idle || !activeId) {
    if (state) {
      state.turnTimerEnd = null;
      state.turnTimerPlayerId = null;
    }
    io.to(room.code).emit('battleship:turnTimer', null);
    return;
  }

  const away = !room.players[activeId]?.connected;
  let seconds: number | null = state.settings.turnTimer > 0 ? state.settings.turnTimer : null;
  if (away) {
    const remaining = state.turnTimerPlayerId === activeId && state.turnTimerEnd
      ? Math.ceil((state.turnTimerEnd - Date.now()) / 1000)
      : Infinity;
    seconds = Math.max(1, Math.min(seconds ?? Infinity, BS_AWAY_GRACE_S, remaining));
  }
  if (seconds === null) {
    state.turnTimerEnd = null;
    state.turnTimerPlayerId = null;
    io.to(room.code).emit('battleship:turnTimer', null);
    return;
  }

  const total = seconds;
  const deadline = Date.now() + total * 1000;
  state.turnTimerEnd = deadline;
  state.turnTimerTotal = total;
  state.turnTimerPlayerId = activeId;

  const interval = setInterval(() => tick(), 1000);
  const tick = () => {
    if (Battleship.getGameState(room.code) !== state || state.phase !== 'battle'
      || state.activePlayerId !== activeId || state.turnTimerEnd !== deadline) {
      clearInterval(interval);
      return;
    }
    const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    io.to(room.code).emit('battleship:turnTimer', { playerId: activeId, secondsLeft, total });
    if (secondsLeft > 0) return;

    Battleship.clearTurnTimer(room.code);
    state.turnTimerEnd = null;
    const shots = Battleship.autoFire(room.code, room);
    for (const shot of shots) io.to(room.code).emit('battleship:shotResult', shot);
    if (Battleship.getGameState(room.code)?.phase === 'finished') {
      driveBattleship(io, room);
      return;
    }
    io.to(room.code).emit('battleship:turnTimer', null);
    scheduleBattleshipTurnEnd(io, room, BS_AUTO_TURN_END_DELAY_MS);
    broadcastBattleshipState(io, room);
  };
  Battleship.setTurnTimer(room.code, interval);
  tick();
}

/** Placement clock: when it runs out, random fleets for anyone still placing and the battle starts. */
function startBattleshipPlacementClock(io: SocketIOServer, room: Room): void {
  Battleship.clearTurnTimer(room.code);
  const state = Battleship.getGameState(room.code);
  if (!state || state.phase !== 'placement' || state.settings.placementTimer === 0) {
    io.to(room.code).emit('battleship:turnTimer', null);
    return;
  }

  const total = state.settings.placementTimer;
  const deadline = Date.now() + total * 1000;
  state.placementTimerEnd = deadline;

  const interval = setInterval(() => tick(), 1000);
  const tick = () => {
    if (Battleship.getGameState(room.code) !== state || state.phase !== 'placement') {
      clearInterval(interval);
      return;
    }
    const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    io.to(room.code).emit('battleship:turnTimer', { playerId: null, secondsLeft, total });
    if (secondsLeft > 0) return;

    Battleship.clearTurnTimer(room.code);
    Battleship.autoPlaceRemaining(room.code);
    if (Battleship.startBattle(room.code)) driveBattleship(io, room);
  };
  Battleship.setTurnTimer(room.code, interval);
  tick();
}

/** Player came back: swap IDs, refresh everyone, and give them a fair clock if it's their turn. */
function handleBattleshipReconnect(io: SocketIOServer, room: Room, oldId: string, newId: string): void {
  Battleship.swapPlayerId(room.code, oldId, newId);
  const state = Battleship.getGameState(room.code);
  if (!state) return;
  broadcastBattleshipState(io, room);

  if (state.phase === 'battle' && (state.activePlayerId === newId || !Battleship.hasTurnTimer(room.code))) {
    startBattleshipTurnClock(io, room);
  } else {
    io.to(newId).emit('battleship:turnTimer', Battleship.getTurnTimerSnapshot(room.code));
  }
}

function handleBattleshipDisconnect(io: SocketIOServer, room: Room, playerId: string): void {
  const state = Battleship.getGameState(room.code);
  if (!state) return;

  if (state.phase === 'placement' && Battleship.allPlayersReady(room.code, room) && Battleship.startBattle(room.code)) {
    driveBattleship(io, room);
    return;
  }
  broadcastBattleshipState(io, room); // their fleet shows "away"
  const nobodyOnline = !Object.values(room.players).some(p => p.connected);
  if (state.phase === 'battle' && (state.activePlayerId === playerId || nobodyOnline)) {
    startBattleshipTurnClock(io, room);
  }
}

/** A player left for good: dropped while placing, fleet scuttled in battle. */
function handleBattleshipDeparture(io: SocketIOServer, room: Room, playerId: string): void {
  const state = Battleship.getGameState(room.code);
  const wasActive = state?.activePlayerId === playerId;
  if (!state || !Battleship.removePlayer(room.code, playerId, room)) return;

  if (state.phase === 'placement') {
    if (Battleship.allPlayersReady(room.code, room) && Battleship.startBattle(room.code)) driveBattleship(io, room);
    else broadcastBattleshipState(io, room);
    return;
  }
  if (state.phase === 'finished' || wasActive) driveBattleship(io, room);
  else broadcastBattleshipState(io, room);
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

/**
 * A player left for good: their hand is folded and they're out of the tournament.
 * If it was their turn (or only one player is left in the hand) play moves on now.
 */
function handlePokerDeparture(io: SocketIOServer, room: Room, playerId: string): void {
  const outcome = Poker.removePlayer(room.code, playerId);
  if (!outcome) return;
  if (outcome === 'gameOver') {
    room.phase = 'finished';
    io.to(room.code).emit('hub:roomUpdated', room);
  }
  // 'seat': the hand carries on as it was, so the running clock and phase step stay
  if (outcome === 'seat') broadcastPokerState(io, room);
  else drivePoker(io, room);
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
// Rooms where nobody is online: no clock runs and nobody is auto-played until someone is back
const flip7Paused = new Set<string>();

function bumpFlip7Token(roomCode: string): number {
  const token = (flip7TurnTokens.get(roomCode) ?? 0) + 1;
  flip7TurnTokens.set(roomCode, token);
  return token;
}

/** Drop every pending Flip 7 callback for a room (game ended or restarted). */
function clearFlip7RoomTimers(roomCode: string): void {
  flip7TurnTokens.delete(roomCode);
  flip7Paused.delete(roomCode);
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
  if (!anyoneOnline(room)) {
    flip7Paused.add(room.code);
    return;
  }

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
      if (!anyoneOnline(room)) {
        flip7Paused.add(room.code); // the whole table is away: wait for them
        return;
      }
      onExpire();
    }
  }, 1000);
  Flip7.setRoomTimer(room.code, interval);
}

/** First player back at a paused table: start a fresh clock for whatever the table is waiting on. */
function resumeFlip7IfPaused(io: SocketIOServer, room: Room): void {
  if (!flip7Paused.delete(room.code)) return;
  bumpFlip7Token(room.code); // a turn start still waiting on a reveal from before the pause is stale now
  beginFlip7Turn(io, room);
}

/** After the grace period, act for an offline player the table is still waiting on. */
function armFlip7Grace(io: SocketIOServer, room: Room, playerId: string): void {
  const key = `${room.code}:${playerId}`;
  if (disconnectGraceTimers.has(key)) return;

  const timer = setTimeout(() => {
    disconnectGraceTimers.delete(key);
    if (room.players[playerId]?.connected) return; // came back
    if (!Flip7.isAwaitingPlayer(room.code, playerId)) return; // the moment has passed
    if (!anyoneOnline(room)) {
      flip7Paused.add(room.code); // nobody left to play against: wait for the table
      return;
    }
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

// ---- Read the Room Helpers ----

/** The sender's room, if it's playing Read the Room right now. */
function readTheRoomRoom(socketId: string): Room | null {
  const room = RoomManager.getRoomByPlayer(socketId);
  if (!room || room.currentGameId !== 'read-the-room' || !ReadTheRoom.getGameState(room.code)) return null;
  return room;
}

function emitReadTheRoomState(io: SocketIOServer, room: Room, playerId: string): void {
  const clientState = ReadTheRoom.getClientState(room.code, playerId, room);
  if (clientState) io.to(playerId).emit('read-the-room:stateUpdated', clientState);
}

function broadcastReadTheRoomState(io: SocketIOServer, room: Room): void {
  for (const pid of Object.keys(room.players)) {
    if (room.players[pid].connected) emitReadTheRoomState(io, room, pid);
  }
}

/**
 * Single entry point after every Read the Room transition: one pending step (guess clock,
 * call clock or away grace) and one 1 s ticker per room. Deadlines that are already running
 * are kept, so a reconnect or a broadcast never resets a clock. Nothing runs while nobody is online.
 */
function driveReadTheRoom(io: SocketIOServer, room: Room): void {
  const state = ReadTheRoom.getGameState(room.code);
  if (!state) return;
  ReadTheRoom.clearPhaseTimers(room.code);

  if (state.phase === 'finished' && room.phase !== 'finished') {
    room.phase = 'finished';
    io.to(room.code).emit('hub:roomUpdated', room);
  }
  if (!anyoneOnline(room)) {
    ReadTheRoom.pauseClocks(room.code); // fresh clocks when someone is back
    return;
  }

  const step = ReadTheRoom.nextStep(room.code, room, Date.now());
  broadcastReadTheRoomState(io, room);
  if (!step) {
    io.to(room.code).emit('read-the-room:timer', null);
    return;
  }

  const { phase, roundNumber } = state;
  const tick = () => io.to(room.code).emit('read-the-room:timer', {
    kind: step.kind,
    secondsLeft: Math.max(0, Math.ceil((step.at - Date.now()) / 1000)),
    total: step.total,
  });
  tick();
  ReadTheRoom.setTicker(room.code, setInterval(tick, 1000));
  ReadTheRoom.setPhaseTimer(room.code, setTimeout(() => {
    ReadTheRoom.clearPhaseTimers(room.code);
    if (ReadTheRoom.getGameState(room.code) !== state || state.phase !== phase || state.roundNumber !== roundNumber) return;
    ReadTheRoom.runStep(room.code, room, step.kind, Date.now());
    driveReadTheRoom(io, room);
  }, Math.max(0, step.at - Date.now())));
}

/** After a disconnect, reconnect or departure: re-check what the round waits on, then drive. */
function progressReadTheRoom(io: SocketIOServer, room: Room): void {
  if (!ReadTheRoom.getGameState(room.code)) return;
  ReadTheRoom.settle(room.code, room, Date.now());
  driveReadTheRoom(io, room);
}

/** A player left for good: they're skipped from now on but stay in the recap and awards. */
function handleReadTheRoomDeparture(io: SocketIOServer, room: Room, playerId: string): void {
  if (!ReadTheRoom.removePlayer(room.code, playerId)) return;
  progressReadTheRoom(io, room);
}
