'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRoom } from '@/lib/hub/useRoom';
import Lobby from '@/components/hub/Lobby';
import StoryThiefGame from '@/components/games/story-thief/StoryThiefGame';
import LiarsDiceGame from '@/components/games/liars-dice/LiarsDiceGame';
import BattleshipGame from '@/components/games/battleship/BattleshipGame';
import PokerGame from '@/components/games/poker/PokerGame';
import Flip7Game from '@/components/games/flip7/Flip7Game';
import ReadTheRoomGame from '@/components/games/read-the-room/ReadTheRoomGame';

// ---- The name + room this tab last joined with (sessionStorage) ----
// Read through useSyncExternalStore: null while prerendering, the real value once hydrated.

function subscribeSession(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function readSession(): string {
  return `${sessionStorage.getItem('playerName') ?? ''}\n${sessionStorage.getItem('roomCode') ?? ''}`;
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomHook = useRoom();
  const { room, playerId, connected, joinRoom, error, setError } = roomHook;
  const attemptedJoin = useRef(false);
  const [joinFailed, setJoinFailed] = useState(false);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);

  const code = typeof params.code === 'string' ? params.code.toUpperCase() : '';
  const session = useSyncExternalStore(subscribeSession, readSession, () => null);
  const [storedName, storedCode] = session === null ? ['', ''] : session.split('\n');
  const hasSession = !!storedName && storedCode === code;

  // Direct link / QR join (no session for this room), or the automatic rejoin failed
  const needsName = !room && session !== null && (!hasSession || joinFailed);

  useEffect(() => {
    if (!connected || attemptedJoin.current || !hasSession) return;
    if (room && room.code === code) return;

    // The socket's connect handler in useRoom rejoins automatically. If no room
    // arrives within 2 seconds, join explicitly.
    attemptedJoin.current = true;
    const timeout = setTimeout(() => {
      joinRoom(code, storedName).catch(() => setJoinFailed(true));
    }, 2000);
    return () => clearTimeout(timeout);
  }, [connected, room, code, joinRoom, hasSession, storedName]);

  const handleJoin = async () => {
    if (!name.trim() || !code) return;
    setJoining(true);
    setError(null);
    try {
      await joinRoom(code, name.trim());
      setJoinFailed(false);
    } catch {
      // error is shown from roomHook.error
    } finally {
      setJoining(false);
    }
  };

  // Leaving from inside a game goes back to the home page, like the lobby's Leave button
  const { leaveRoom } = roomHook;
  const leaveToHome = useCallback(() => {
    leaveRoom();
    router.push('/');
  }, [leaveRoom, router]);
  const gameRoomHook = { ...roomHook, leaveRoom: leaveToHome };

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
        {!connected && (
          <div className="fixed top-0 left-0 right-0 bg-(--danger)/90 text-white text-xs text-center py-1.5 z-50 animate-soft-pulse">
            Reconnecting...
          </div>
        )}
        <div className="text-center animate-fade-in">
          <div className="text-4xl mb-4">{connected ? '⏳' : '🔌'}</div>
          <p className="text-(--text-secondary)">{connected ? `Joining room ${code}...` : 'Connecting...'}</p>
        </div>
      </div>
    );
  }

  const inGame = room.phase === 'playing' || room.phase === 'finished';

  // Main content
  return (
    <>
      {!connected && (
        <div className="fixed top-0 left-0 right-0 bg-(--danger)/90 text-white text-xs text-center py-1.5 z-50 animate-soft-pulse">
          Reconnecting...
        </div>
      )}

      {inGame && room.currentGameId === 'story-thief' ? (
        <StoryThiefGame room={room} playerId={playerId!} isHost={roomHook.isHost} onLeaveRoom={leaveToHome} />
      ) : inGame && room.currentGameId === 'liars-dice' ? (
        <LiarsDiceGame roomHook={gameRoomHook} />
      ) : inGame && room.currentGameId === 'battleship' ? (
        <BattleshipGame roomHook={gameRoomHook} />
      ) : inGame && room.currentGameId === 'poker' ? (
        <PokerGame roomHook={gameRoomHook} />
      ) : inGame && room.currentGameId === 'flip7' ? (
        <Flip7Game roomHook={gameRoomHook} />
      ) : inGame && room.currentGameId === 'read-the-room' ? (
        <ReadTheRoomGame roomHook={gameRoomHook} />
      ) : (
        <Lobby roomHook={roomHook} />
      )}
    </>
  );
}
