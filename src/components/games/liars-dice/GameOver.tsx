'use client';

import type { LiarsDicePlayerInfo } from '@/types/games/liars-dice';
import Confetti from '@/components/shared/Confetti';

interface GameOverProps {
  players: LiarsDicePlayerInfo[];
  eliminationOrder: { id: string; name: string; avatar: string }[];
  myId: string | null;
  isHost: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
  onLeaveRoom: () => void;
}

export default function GameOver({
  players,
  eliminationOrder,
  myId,
  isHost,
  onRematch,
  onBackToLobby,
  onLeaveRoom,
}: GameOverProps) {
  // Winner is the player NOT in elimination order (last one standing)
  const eliminatedIds = new Set(eliminationOrder.map(e => e.id));
  const winner = players.find(p => !eliminatedIds.has(p.id));

  // Build standings: winner first, then reverse elimination order
  const standings = [
    ...(winner ? [{ id: winner.id, name: winner.name, avatar: winner.avatar }] : []),
    ...[...eliminationOrder].reverse(),
  ];

  const iWon = winner?.id === myId;

  const placeSuffix = (n: number) => {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6 animate-fade-in">
      {iWon && <Confetti />}

      {/* Winner announcement */}
      {winner && (
        <div className="text-center animate-celebrate">
          <span className="text-5xl">{winner.avatar}</span>
          <h2 className="text-2xl font-bold text-(--text-primary) mt-2">
            👑 {winner.name} Wins!
          </h2>
          {iWon && (
            <p className="text-(--game-accent) text-sm mt-1">That&apos;s you! 🎉</p>
          )}
        </div>
      )}

      {/* Final standings */}
      <div className="bg-(--bg-card) border border-(--border) rounded-xl p-4 w-full max-w-sm">
        <h3 className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted) mb-3 text-center">
          Final Standings
        </h3>
        <div className="space-y-2">
          {standings.map((player, i) => {
            const place = i + 1;
            const isMe = player.id === myId;
            return (
              <div
                key={player.id}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg ${
                  isMe ? 'bg-(--bg-elevated) ring-1 ring-(--brand)/30' : ''
                }`}
              >
                <span className={`text-lg font-bold min-w-[32px] ${
                  place === 1 ? 'text-(--game-accent)' : 'text-(--text-muted)'
                }`}>
                  {place}{placeSuffix(place)}
                </span>
                <span className="text-xl">{player.avatar}</span>
                <span className="text-sm text-(--text-primary) flex-1">{player.name}</span>
                {place === 1 && <span>👑</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Host actions */}
      {isHost ? (
        <div className="w-full max-w-sm space-y-2">
          <button
            onClick={onRematch}
            className="w-full py-4 bg-(--game-accent) text-white rounded-xl font-semibold text-base active:scale-[0.97] transition-all"
          >
            🔄 Rematch
          </button>
          <button
            onClick={onBackToLobby}
            className="w-full py-3 bg-(--bg-card) border border-(--border) text-(--text-secondary) rounded-xl text-sm active:scale-[0.97] transition-all"
          >
            🏠 Back to Lobby
          </button>
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-2">
          <p className="text-sm text-(--text-muted) animate-soft-pulse text-center">
            Waiting for host...
          </p>
          <button
            onClick={onLeaveRoom}
            className="w-full py-2.5 text-(--text-muted) text-xs hover:text-(--text-secondary) transition-colors"
          >
            Leave Room
          </button>
        </div>
      )}
    </div>
  );
}
