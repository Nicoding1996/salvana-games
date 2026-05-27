'use client';

import type { Flip7PlayerInfo } from '@/types/games/flip7';
import Confetti from '@/components/shared/Confetti';

interface GameOverProps {
  players: Flip7PlayerInfo[];
  winnerId: string | null;
  roundScores: { playerId: string; playerName: string; roundScore: number; cumulativeScore: number; busted: boolean }[] | null;
  myId: string;
  isHost: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
  onLeaveRoom: () => void;
}

export default function GameOver({
  players, winnerId, roundScores, myId, isHost, onRematch, onBackToLobby, onLeaveRoom
}: GameOverProps) {
  const winner = players.find(p => p.id === winnerId);
  const sorted = [...players].sort((a, b) => b.cumulativeScore - a.cumulativeScore);
  const isWinner = winnerId === myId;

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full p-4" data-game="flip-7">
      <Confetti />

      {/* Winner announcement */}
      <div className="text-center py-6">
        <p className="text-5xl mb-3 animate-celebrate">{winner?.avatar || '🏆'}</p>
        <h2 className="text-xl font-bold text-(--text-primary)">
          {isWinner ? 'You Win!' : `${winner?.name || 'Unknown'} Wins!`}
        </h2>
        <p className="text-sm text-(--game-accent) font-semibold mt-1">
          {winner?.cumulativeScore || 0} points
        </p>
      </div>

      {/* Final standings */}
      <div className="space-y-2 flex-1 overflow-y-auto mb-4">
        {sorted.map((player, i) => (
          <div
            key={player.id}
            className={`flex items-center gap-3 p-3 rounded-xl border ${
              player.id === winnerId
                ? 'bg-(--game-accent)/10 border-(--game-accent)/30'
                : 'bg-(--bg-card) border-(--border)'
            }`}
          >
            <span className="text-sm font-bold text-(--text-muted) w-5">
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
            </span>
            <span className="text-lg">{player.avatar}</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-(--text-primary)">
                {player.id === myId ? 'You' : player.name}
              </p>
            </div>
            <p className="text-sm font-bold text-(--text-primary)">{player.cumulativeScore} pts</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {isHost ? (
          <>
            <button
              onClick={onRematch}
              className="w-full py-3.5 bg-(--game-accent) text-black rounded-xl font-semibold active:scale-[0.97] transition-all"
            >
              🔄 Rematch
            </button>
            <button
              onClick={onBackToLobby}
              className="w-full py-3 bg-(--bg-card) border border-(--border) text-(--text-secondary) rounded-xl text-sm active:scale-[0.97] transition-all"
            >
              Back to Lobby
            </button>
          </>
        ) : (
          <>
            <p className="text-center text-xs text-(--text-muted) mb-2">Waiting for host...</p>
            <button
              onClick={onLeaveRoom}
              className="w-full py-3 bg-(--bg-card) border border-(--border) text-(--text-secondary) rounded-xl text-sm active:scale-[0.97] transition-all"
            >
              Leave Room
            </button>
          </>
        )}
      </div>
    </div>
  );
}
