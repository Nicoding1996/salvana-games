'use client';

import type { BattleshipPlayerInfo } from '@/types/games/battleship';
import Confetti from '@/components/shared/Confetti';

interface GameOverProps {
  players: BattleshipPlayerInfo[];
  myId: string;
  isHost: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
  onLeaveRoom: () => void;
}

export default function GameOver({
  players,
  myId,
  isHost,
  onRematch,
  onBackToLobby,
  onLeaveRoom,
}: GameOverProps) {
  // Winner is the last alive player
  const winner = players.find(p => p.alive);
  const isWinner = winner?.id === myId;

  // Sort players: winner first, then by ships remaining (desc)
  const sorted = [...players].sort((a, b) => {
    if (a.alive && !b.alive) return -1;
    if (!a.alive && b.alive) return 1;
    return b.shipsRemaining - a.shipsRemaining;
  });

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto animate-fade-in">
      {isWinner && <Confetti />}

      <div className="text-center mb-6">
        <div className="text-5xl mb-3 animate-celebrate">
          {isWinner ? '🏆' : '⚓'}
        </div>
        <h2 className="text-xl font-bold text-(--text-primary)">
          {isWinner ? 'Victory!' : 'Game Over'}
        </h2>
        {winner && (
          <p className="text-sm text-(--text-secondary) mt-1">
            {isWinner ? 'Your fleet survived!' : `${winner.avatar} ${winner.name} wins!`}
          </p>
        )}
      </div>

      {/* Standings */}
      <div className="w-full bg-(--bg-card) border border-(--border) rounded-xl p-4 mb-6">
        <h3 className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted) mb-3">Final Standings</h3>
        <div className="space-y-2">
          {sorted.map((player, idx) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 py-2 px-3 rounded-lg ${
                player.id === myId ? 'bg-(--game-accent)/10' : ''
              }`}
            >
              <span className="text-sm font-bold text-(--text-muted) w-5">
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
              </span>
              <span className="text-lg">{player.avatar}</span>
              <div className="flex-1">
                <p className={`text-sm font-medium ${player.alive ? 'text-(--text-primary)' : 'text-(--text-muted)'}`}>
                  {player.name} {player.id === myId && '(You)'}
                </p>
                <p className="text-[10px] text-(--text-muted)">
                  {player.alive ? `${player.shipsRemaining} ships remaining` : 'Fleet destroyed'}
                </p>
              </div>
              {player.alive && (
                <span className="text-(--success) text-xs">👑</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="w-full space-y-2">
        {isHost && (
          <>
            <button
              onClick={onRematch}
              className="w-full py-3.5 bg-(--game-accent) text-white rounded-xl font-semibold active:scale-[0.97] transition-all"
            >
              ⚓ Rematch
            </button>
            <button
              onClick={onBackToLobby}
              className="w-full py-2.5 bg-(--bg-card) border border-(--border) text-(--text-secondary) rounded-xl text-sm active:scale-[0.97] transition-all"
            >
              Back to Lobby
            </button>
          </>
        )}
        {!isHost && (
          <button
            onClick={onLeaveRoom}
            className="w-full py-2.5 text-(--text-muted) text-xs hover:text-(--text-secondary) transition-colors"
          >
            Leave Room
          </button>
        )}
      </div>
    </div>
  );
}
