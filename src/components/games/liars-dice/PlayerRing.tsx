'use client';

import type { LiarsDicePlayerInfo } from '@/types/games/liars-dice';
import { LIVES_DISPLAY } from '@/types/games/liars-dice';

interface PlayerRingProps {
  players: LiarsDicePlayerInfo[];
  activePlayerId: string | null;
  myId: string | null;
  totalDiceOnTable: number;
}

export default function PlayerRing({ players, activePlayerId, myId, totalDiceOnTable }: PlayerRingProps) {
  const alivePlayers = players.filter(p => p.alive);
  const eliminatedPlayers = players.filter(p => !p.alive);

  // Find who's next after active player
  const activeIndex = alivePlayers.findIndex(p => p.id === activePlayerId);
  const nextPlayerId = activeIndex >= 0
    ? alivePlayers[(activeIndex + 1) % alivePlayers.length]?.id
    : null;

  return (
    <div className="flex flex-col items-center gap-2 px-2">
      {/* Total dice on table — critical strategic info */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-(--bg-primary)/60 border border-(--border)">
        <span className="text-[10px] text-(--text-muted) uppercase tracking-wider">Table</span>
        <span className="text-sm font-bold text-(--text-primary)">{totalDiceOnTable}</span>
        <span className="text-[10px] text-(--text-muted)">🎲</span>
      </div>

      {/* Turn order row — alive players */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {alivePlayers.map((player, i) => {
          const isActive = player.id === activePlayerId;
          const isMe = player.id === myId;
          const isNext = player.id === nextPlayerId && !isActive;

          return (
            <div key={player.id} className="flex items-center gap-1">
              <div
                className={`
                  relative flex flex-col items-center px-2.5 py-1.5 rounded-xl transition-all min-w-[68px]
                  ${isActive
                    ? 'bg-(--bg-elevated) ring-2 ring-(--game-accent) animate-glow-pulse scale-105'
                    : isNext
                      ? 'bg-(--bg-card) border border-(--border-light) ring-1 ring-(--text-muted)/20'
                      : 'bg-(--bg-card) border border-(--border)'
                  }
                  ${isMe && !isActive ? 'ring-1 ring-(--brand)/40' : ''}
                `}
              >
                {/* "Next" indicator */}
                {isNext && (
                  <span className="absolute -top-1.5 right-1 text-[8px] text-(--text-muted) bg-(--bg-card) px-1 rounded">
                    next
                  </span>
                )}

                {/* Avatar */}
                <span className="text-lg leading-none">{player.avatar}</span>

                {/* Name */}
                <span className={`text-[10px] mt-0.5 truncate max-w-[56px] ${
                  isMe ? 'text-(--brand) font-medium' : player.connected ? 'text-(--text-primary)' : 'text-(--text-muted)'
                }`}>
                  {isMe ? 'You' : player.name}
                </span>

                {/* Dice count — BIG and prominent */}
                <div className="flex items-center gap-0.5 mt-0.5">
                  <span className="text-[10px]">🎲</span>
                  <span className={`text-sm font-bold ${
                    player.diceCount <= 2 ? 'text-(--danger)' : 'text-(--text-primary)'
                  }`}>
                    {player.diceCount}
                  </span>
                </div>

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
