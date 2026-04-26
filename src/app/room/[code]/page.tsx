'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRoom } from '@/lib/hub/useRoom';
import Lobby from '@/components/hub/Lobby';
import StoryThiefGame from '@/components/games/story-thief/StoryThiefGame';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomHook = useRoom();
  const { room, playerId, connected, joinRoom, error, setError } = roomHook;
  const attemptedRejoin = useRef(false);
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);

  const code = typeof params.code === 'string' ? params.code.toUpperCase() : '';

  useEffect(() => {
    if (!connected || attemptedRejoin.current) return;

    // Already have room state (navigated from home page)
    if (room && room.code === code) return;

    // Try to rejoin using stored session
    const storedName = typeof window !== 'undefined' ? sessionStorage.getItem('playerName') : null;
    if (storedName && code) {
      attemptedRejoin.current = true;
      joinRoom(code, storedName).catch(() => {
        // Failed to rejoin with stored name — show name input
        setNeedsName(true);
      });
    } else {
      // No stored session — show name input so they can join directly via QR/link
      setNeedsName(true);
    }
  }, [connected, room, code, joinRoom, router]);

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

  if (!connected) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-4xl mb-4">🔌</div>
          <p className="text-(--text-secondary)">Connecting...</p>
        </div>
      </div>
    );
  }

  // Show name input for direct link / QR code joins
  if (needsName && !room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
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
            disabled={!name.trim() || joining}
            className="w-full py-4 bg-(--brand) text-(--bg-primary) disabled:opacity-40 rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
          >
            {joining ? 'Joining...' : 'Join Game'}
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-(--text-secondary)">Joining room {code}...</p>
        </div>
      </div>
    );
  }

  // Game is active
  if (room.phase === 'playing' && room.currentGameId === 'story-thief') {
    return <StoryThiefGame room={room} playerId={playerId!} isHost={roomHook.isHost} />;
  }

  // Lobby
  return <Lobby roomHook={roomHook} />;
}
