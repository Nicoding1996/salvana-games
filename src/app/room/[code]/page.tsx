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
  const { room, playerId, connected, joinRoom } = roomHook;
  const attemptedRejoin = useRef(false);

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
        // Failed to rejoin, redirect home
        router.push('/');
      });
    } else if (!room) {
      // No stored session and no room state, redirect home
      router.push('/');
    }
  }, [connected, room, code, joinRoom, router]);

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
