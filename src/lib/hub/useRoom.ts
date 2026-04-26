'use client';

import { useState, useEffect, useCallback } from 'react';
import { connectSocket, getSocket } from '@/lib/socket/client';
import type { Room, RoomSettings } from '@/types/hub';

// Module-level state so it survives across component re-mounts during navigation
let _room: Room | null = null;
let _playerId: string | null = null;
let _connected = false;
const _listeners = new Set<() => void>();

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

export function useRoom() {
  const [room, setRoom] = useState<Room | null>(_room);
  const [playerId, setPlayerId] = useState<string | null>(_playerId);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(_connected);

  useEffect(() => {
    // Sync from global state
    const listener = () => {
      setRoom(_room);
      setPlayerId(_playerId);
      setConnected(_connected);
    };
    _listeners.add(listener);

    const socket = connectSocket();

    const onConnect = () => {
      _connected = true;
      notifyListeners();
    };
    const onDisconnect = () => {
      _connected = false;
      notifyListeners();
    };
    const onRoomUpdated = (updatedRoom: Room) => {
      setGlobalRoom(updatedRoom);
    };
    const onError = (msg: string) => setError(msg);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('hub:roomUpdated', onRoomUpdated);
    socket.on('hub:error', onError);

    // If already connected, set state immediately
    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      _listeners.delete(listener);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('hub:roomUpdated', onRoomUpdated);
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
          // Save to sessionStorage for reconnection
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
          // Save to sessionStorage for reconnection
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
