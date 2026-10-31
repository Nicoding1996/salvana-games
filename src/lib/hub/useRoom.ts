'use client';

import { useState, useEffect, useCallback } from 'react';
import { connectSocket, getSocket } from '@/lib/socket/client';
import type { Room, RoomSettings } from '@/types/hub';

// Module-level state — survives component remounts and page navigation
let _room: Room | null = null;
let _playerId: string | null = null;
let _connected = false;
const _listeners = new Set<() => void>();
let _socketBound = false;
let _deviceToken: string | null = null;

const DEVICE_TOKEN_KEY = 'deviceToken';
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Random ID for this browser, kept in localStorage so it survives reloads and a closed tab.
 * The server ties each seat to it: this browser can always take its seat back, nobody else can.
 * Falls back to sessionStorage (survives reloads in this tab) when localStorage is blocked.
 * Uses getRandomValues (not randomUUID) so it also works on plain-HTTP LAN addresses.
 */
function deviceToken(): string {
  if (_deviceToken) return _deviceToken;
  const stores = [() => localStorage, () => sessionStorage];
  for (const store of stores) {
    try {
      const stored = store().getItem(DEVICE_TOKEN_KEY);
      if (stored && DEVICE_TOKEN_PATTERN.test(stored)) return (_deviceToken = stored);
    } catch {
      // This storage is blocked: try the next one
    }
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  _deviceToken = token;
  for (const store of stores) {
    try {
      store().setItem(DEVICE_TOKEN_KEY, token);
      break;
    } catch {
      // Blocked: try the next one (with neither, the token lasts for this page)
    }
  }
  return token;
}

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

function setGlobalRoom(room: Room | null) {
  _room = room;
  notifyListeners();
}

function setGlobalPlayerId(id: string | null) {
  _playerId = id;
  notifyListeners();
}

// Bind socket listeners once globally — not per component mount
function ensureSocketBound() {
  if (_socketBound) return;
  _socketBound = true;

  const socket = connectSocket();

  socket.on('connect', () => {
    _connected = true;
    notifyListeners();

    // On reconnect, re-join the room so the server knows who we are
    // (new socket ID means the server lost track of us)
    const storedName = typeof window !== 'undefined' ? sessionStorage.getItem('playerName') : null;
    const storedCode = typeof window !== 'undefined' ? sessionStorage.getItem('roomCode') : null;

    // Auto-rejoin on the room page that matches the stored code, or anywhere while we still
    // hold that room (the home page keeps a game you went back from without leaving it).
    // A home page that left the room cleared the session, so it doesn't rejoin.
    const onMatchingRoomPage = typeof window !== 'undefined' && storedCode &&
      window.location.pathname.toLowerCase() === `/room/${storedCode.toLowerCase()}`;
    const holdingRoom = !!storedCode && _room?.code === storedCode;

    if (storedName && storedCode && (onMatchingRoomPage || holdingRoom)) {
      // Rejoin to re-register with the server. Handles both reconnection (socket dropped)
      // and full page refresh. The device token gets our own seat back even if the server
      // hasn't noticed the old connection died yet.
      const reason = _room ? 'Reconnected' : 'Connected with session data';
      console.log(`[useRoom] ${reason}, re-joining room ${storedCode} as ${storedName}`);
      socket.emit('hub:joinRoom', { code: storedCode, playerName: storedName, token: deviceToken() }, (res) => {
        if (res.success && res.room && res.playerId) {
          setGlobalPlayerId(res.playerId);
          setGlobalRoom(res.room);
          console.log(`[useRoom] Re-joined room ${storedCode} successfully`);
        } else {
          console.log(`[useRoom] Failed to re-join room: ${res.error}`);
          // Room might be gone — clear state
          setGlobalRoom(null);
          setGlobalPlayerId(null);
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('playerName');
            sessionStorage.removeItem('roomCode');
          }
        }
      });
    }
  });

  socket.on('disconnect', () => {
    _connected = false;
    notifyListeners();
  });

  socket.on('hub:roomUpdated', (updatedRoom: Room) => {
    setGlobalRoom(updatedRoom);
  });

  socket.on('hub:kicked', () => {
    // Kicked by host — clear state and navigate home
    _room = null;
    _playerId = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('playerName');
      sessionStorage.removeItem('roomCode');
      // Navigate to home page
      window.location.href = '/';
    }
    notifyListeners();
  });

  // Request fresh state when page becomes visible (even if socket stayed connected)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && socket.connected) {
        socket.emit('hub:requestState');
      }
    });
  }
}

export function useRoom() {
  const [room, setRoom] = useState<Room | null>(_room);
  const [playerId, setPlayerId] = useState<string | null>(_playerId);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(_connected);

  useEffect(() => {
    ensureSocketBound();

    const listener = () => {
      setRoom(_room);
      setPlayerId(_playerId);
      setConnected(_connected);
    };
    _listeners.add(listener);

    // Sync immediately
    listener();

    const socket = getSocket();
    const onError = (msg: string) => setError(msg);
    socket.on('hub:error', onError);

    return () => {
      _listeners.delete(listener);
      socket.off('hub:error', onError);
    };
  }, []);

  const createRoom = useCallback((playerName: string): Promise<Room> => {
    return new Promise((resolve, reject) => {
      const socket = getSocket();
      socket.emit('hub:createRoom', { playerName, token: deviceToken() }, (res) => {
        if (res.success && res.room && res.playerId) {
          setGlobalRoom(res.room);
          setGlobalPlayerId(res.playerId);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('playerName', playerName);
            sessionStorage.setItem('roomCode', res.room.code);
          }
          setError(null);
          resolve(res.room);
        } else {
          setError(res.error || 'Failed to create room');
          reject(new Error(res.error));
        }
      });
    });
  }, []);

  const joinRoom = useCallback((code: string, playerName: string): Promise<Room> => {
    return new Promise((resolve, reject) => {
      const socket = getSocket();
      socket.emit('hub:joinRoom', { code: code.toUpperCase(), playerName, token: deviceToken() }, (res) => {
        if (res.success && res.room && res.playerId) {
          setGlobalRoom(res.room);
          setGlobalPlayerId(res.playerId);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('playerName', playerName);
            sessionStorage.setItem('roomCode', res.room.code);
          }
          setError(null);
          resolve(res.room);
        } else {
          setError(res.error || 'Failed to join room');
          reject(new Error(res.error));
        }
      });
    });
  }, []);

  const updateSettings = useCallback((settings: Partial<RoomSettings>) => {
    getSocket().emit('hub:updateSettings', settings);
  }, []);

  const assignTeam = useCallback((targetPlayerId: string, teamId: string) => {
    getSocket().emit('hub:assignTeam', { playerId: targetPlayerId, teamId });
  }, []);

  const startGame = useCallback((gameId: string, gameSettings?: Partial<import('@/types/games/liars-dice').LiarsDiceSettings> | Partial<import('@/types/games/battleship').BattleshipSettings> | Partial<import('@/types/games/poker').PokerSettings> | Partial<import('@/types/games/flip7').Flip7Settings> | Partial<import('@/types/games/read-the-room').ReadTheRoomSettings>) => {
    getSocket().emit('hub:startGame', gameId, gameSettings);
  }, []);

  const selectGame = useCallback((gameId: string) => {
    getSocket().emit('hub:selectGame', gameId);
  }, []);

  const shuffleTeams = useCallback(() => {
    getSocket().emit('hub:shuffleTeams');
  }, []);

  const leaveRoom = useCallback(() => {
    getSocket().emit('hub:leaveRoom');
    setGlobalRoom(null);
    setGlobalPlayerId(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('playerName');
      sessionStorage.removeItem('roomCode');
    }
  }, []);

  const kickPlayer = useCallback((targetPlayerId: string) => {
    getSocket().emit('hub:kickPlayer', { playerId: targetPlayerId });
  }, []);

  const changeAvatar = useCallback((avatar: string) => {
    getSocket().emit('hub:changeAvatar', { avatar });
  }, []);

  const isHost = room?.hostId === playerId;
  const myPlayer = playerId && room ? room.players[playerId] : null;

  return {
    room,
    playerId,
    myPlayer,
    isHost,
    connected,
    error,
    createRoom,
    joinRoom,
    updateSettings,
    assignTeam,
    startGame,
    selectGame,
    shuffleTeams,
    leaveRoom,
    kickPlayer,
    changeAvatar,
    setError,
  };
}
