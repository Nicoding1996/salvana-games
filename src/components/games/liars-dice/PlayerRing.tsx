'use client';

import type { LiarsDicePlayerInfo } from '@/types/games/liars-dice';
import { LIVES_DISPLAY } from '@/types/games/liars-dice';

interface PlayerRingProps {
  players: LiarsDicePlayerInfo[];
  activePlayerId: string | null;
  myId: string | null;
}

export default function PlayerRing({ players, activePlayerId, myId }: PlayerRingProps) {
  // Show ALL players in seating order (including self) so turn order is visible
  const alivePlayers = players.filter(p => p.alive);
  const eliminatedPlayers = players.filter(p => !p.alive);

  return (
    <div className="flex flex-col items-center gap-1.5 px-2">
      {/* Turn order row — alive players with arrows */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {alivePlayers.map((player, i) => {
          const isActive = player.id === activePlayerId;
          const isMe = player.id === myId;

          return (
            <div key={player.id} className="flex items-center gap-1">
              <div
                className={`
                  flex flex-col items-center px-2.5 py-1.5 rounded-xl transition-all min-w-[64px]
                  ${isActive ? 'bg-(--bg-elevated) ring-2 ring-(--game-accent) animate-glow-pulse' : 'bg-(--bg-card) border border-(--border)'}
                  ${isMe ? 'ring-1 ring-(--brand)/40' : ''}
                `}
              >
                {/* Avatar */}
                <span className="text-lg leading-none">{player.avatar}</span>

                {/* Name */}
                <span className={`text-[10px] mt-0.5 truncate max-w-[56px] ${
                  isMe ? 'text-(--brand) font-medium' : player.connected ? 'text-(--text-primary)' : 'text-(--text-muted)'
                }`}>
                  {isMe ? 'You' : player.name}
                </span>

                {/* Lives */}
                <div className="flex gap-0.5 mt-0.5">
                  {Array.from({ length: player.maxLives }, (_, j) => (
                    <span
                      key={j}
                      className={`text-[10px] ${j < player.lives ? '' : 'animate-life-lost'}`}
                    >
                      {j < player.lives ? LIVES_DISPLAY.full : LIVES_DISPLAY.lost}
                    </span>
                  ))}
                </div>

                {/* Connection status */}
                {!player.connected && (
                  <span className="text-[8px] text-(--text-muted)">offline</span>
                )}

                {/* Last life warning */}
                {player.lives === 1 && (
                  <span className="text-[8px] text-(--danger) animate-pulse mt-0.5">💀</span>
                )}
              </div>

              {/* Arrow to next player (not after last) */}
              {i < alivePlayers.length - 1 && (
                <span className="text-[10px] text-(--text-muted)">→</span>
              )}
              {/* Wrap arrow from last to first */}
              {i === alivePlayers.length - 1 && alivePlayers.length > 1 && (
                <span className="text-[10px] text-(--text-muted)">↩</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Eliminated players — small row below */}
      {eliminatedPlayers.length > 0 && (
        <div className="flex items-center gap-2 opacity-40">
          {eliminatedPlayers.map((player) => (
            <div key={player.id} className="flex items-center gap-1 text-[10px] text-(--text-muted)">
              <span>☠️</span>
              <span>{player.id === myId ? 'You' : player.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
