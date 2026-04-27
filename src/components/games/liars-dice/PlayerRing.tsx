'use client';

import type { LiarsDicePlayerInfo } from '@/types/games/liars-dice';
import { LIVES_DISPLAY } from '@/types/games/liars-dice';

interface PlayerRingProps {
  players: LiarsDicePlayerInfo[];
  activePlayerId: string | null;
  myId: string | null;
}

export default function PlayerRing({ players, activePlayerId, myId }: PlayerRingProps) {
  // Show all players except self (self's dice shown separately)
  const others = players.filter(p => p.id !== myId);

  return (
    <div className="flex flex-wrap justify-center gap-2 px-2">
      {others.map((player) => {
        const isActive = player.id === activePlayerId;
        const isEliminated = !player.alive;

        return (
          <div
            key={player.id}
            className={`
              flex flex-col items-center px-3 py-2 rounded-xl transition-all min-w-[72px]
              ${isEliminated ? 'opacity-40 grayscale' : ''}
              ${isActive ? 'bg-(--bg-elevated) ring-2 ring-(--game-accent) animate-glow-pulse' : 'bg-(--bg-card) border border-(--border)'}
            `}
          >
            {/* Avatar */}
            <span className="text-xl leading-none">{isEliminated ? '☠️' : player.avatar}</span>

            {/* Name */}
            <span className={`text-[11px] mt-1 truncate max-w-[64px] ${
              player.connected ? 'text-(--text-primary)' : 'text-(--text-muted)'
            }`}>
              {player.name}
            </span>

            {/* Lives */}
            <div className="flex gap-0.5 mt-0.5">
              {Array.from({ length: player.maxLives }, (_, i) => (
                <span
                  key={i}
                  className={`text-xs ${i < player.lives ? '' : 'animate-life-lost'}`}
                >
                  {i < player.lives ? LIVES_DISPLAY.full : LIVES_DISPLAY.lost}
                </span>
              ))}
            </div>

            {/* Dice count */}
            {player.alive && (
              <span className="text-[10px] text-(--text-muted) mt-0.5">
                🎲 {player.diceCount}
              </span>
            )}

            {/* Connection status */}
            {!player.connected && player.alive && (
              <span className="text-[9px] text-(--text-muted)">offline</span>
            )}

            {/* Last life warning */}
            {player.alive && player.lives === 1 && (
              <span className="text-[9px] text-(--danger) animate-pulse mt-0.5">💀 Last life!</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
