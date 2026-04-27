'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRoom } from '@/lib/hub/useRoom';
import Lobby from '@/components/hub/Lobby';
import StoryThiefGame from '@/components/games/story-thief/StoryThiefGame';
import LiarsDiceGame from '@/components/games/liars-dice/LiarsDiceGame';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomHook = useRoom();
  const { room, playerId, connected, joinRoom, error, setError } = roomHook;
  const attemptedJoin = useRef(false);
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);

  const code = typeof params.code === 'string' ? params.code.toUpperCase() : '';

  useEffect(() => {
    if (!connected || attemptedJoin.current) return;

    // Already have room state (from navigation, reconnect handler, or previous join)
    if (room && room.code === code) return;

    // Check if we have session data — the socket connect handler in useRoom
    // will auto-rejoin, so just wait a moment for it
    const storedName = typeof window !== 'undefined' ? sessionStorage.getItem('playerName') : null;
    const storedCode = typeof window !== 'undefined' ? sessionStorage.getItem('roomCode') : null;

    if (storedName && storedCode === code) {
      // Session data matches this room — the connect handler should auto-rejoin
      // Wait briefly for it, then check if we got room state
      attemptedJoin.current = true;
      const timeout = setTimeout(() => {
        // If still no room after 2 seconds, try joining explicitly
        if (!roomHook.room) {
          joinRoom(code, storedName).catch(() => {
            setNeedsName(true);
          });
        }
      }, 2000);
      return () => clearTimeout(timeout);
    } else if (!storedName || storedCode !== code) {
      // No session data or different room — show name input
      setNeedsName(true);
    }
  }, [connected, room, code, joinRoom, router, roomHook.room]);

  const handleJoin = async () => {
    if (!name.trim() || !code) return;
    setJoining(true);
    setError(null);
    try {
      await joinRoom(code, name.trim());
      setNeedsName(false);
    } catch {
      setJoining(false);
    }
  };

  // Show name input for direct link / QR code joins
  if (needsName && !room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {!connected && (
          <div className="fixed top-0 left-0 right-0 bg-(--danger)/90 text-white text-xs text-center py-1.5 z-50 animate-soft-pulse">
            Reconnecting...
          </div>
        )}
        <div className="w-full max-w-xs space-y-4 animate-slide-up">
          <div className="text-center mb-6">
            <p className="text-xs uppercase tracking-[0.2em] text-(--text-muted) mb-1">Joining Room</p>
            <div className="text-3xl font-mono font-bold tracking-[0.3em] text-(--brand)">{code}</div>
          </div>
          <div>
            <label htmlFor="join-name" className="block text-xs text-(--text-secondary) mb-1.5 ml-1">Your Name</label>
            <input
              id="join-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              className="w-full py-3.5 px-4 bg-(--bg-card) border border-(--border) rounded-xl text-base outline-none focus:border-(--brand) transition-colors placeholder:text-(--text-muted)"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>
          {error && <p className="text-(--danger) text-sm ml-1" role="alert">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={!name.trim() || joining || !connected}
            className="w-full py-4 bg-(--brand) text-(--bg-primary) disabled:opacity-40 rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
          >
            {!connected ? 'Connecting...' : joining ? 'Joining...' : 'Join Game'}
          </button>
        </div>
      </div>
    );
  }

  // Waiting for room state
  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-4xl mb-4">{connected ? '⏳' : '🔌'}</div>
          <p className="text-(--text-secondary)">{connected ? `Joining room ${code}...` : 'Connecting...'}</p>
        </div>
      </div>
    );
  }

  // Main content
  return (
    <>
      {!connected && (
        <div className="fixed top-0 left-0 right-0 bg-(--danger)/90 text-white text-xs text-center py-1.5 z-50 animate-soft-pulse">
          Reconnecting...
        </div>
      )}

      {(room.phase === 'playing' || room.phase === 'finished') && room.currentGameId === 'story-thief' ? (
        <StoryThiefGame room={room} playerId={playerId!} isHost={roomHook.isHost} onLeaveRoom={roomHook.leaveRoom} />
      ) : (room.phase === 'playing' || room.phase === 'finished') && room.currentGameId === 'liars-dice' ? (
        <LiarsDiceGame roomHook={roomHook} />
      ) : (
        <Lobby roomHook={roomHook} />
      )}
    </>
  );
}
