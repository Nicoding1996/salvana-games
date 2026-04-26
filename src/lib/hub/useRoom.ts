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

    if (storedName && storedCode && _room) {
      // We were in a room — rejoin to re-register with the server
      console.log(`[useRoom] Reconnected, re-joining room ${storedCode} as ${storedName}`);
      socket.emit('hub:joinRoom', { code: storedCode, playerName: storedName }, (res) => {
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
    } else if (storedName && storedCode) {
      // We have session data but no room state — try to join
      console.log(`[useRoom] Connected with session data, joining ${storedCode}`);
      socket.emit('hub:joinRoom', { code: storedCode, playerName: storedName }, (res) => {
        if (res.success && res.room && res.playerId) {
          setGlobalPlayerId(res.playerId);
          setGlobalRoom(res.room);
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
      socket.emit('hub:createRoom', { playerName }, (res) => {
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
      socket.emit('hub:joinRoom', { code: code.toUpperCase(), playerName }, (res) => {
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

  const startGame = useCallback((gameId: string) => {
    getSocket().emit('hub:startGame', gameId);
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
    shuffleTeams,
    leaveRoom,
    setError,
  };
}
