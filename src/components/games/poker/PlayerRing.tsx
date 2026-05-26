'use client';

import type { PokerPlayerInfo } from '@/types/games/poker';

interface PlayerRingProps {
  players: PokerPlayerInfo[];
  activePlayerId: string | null;
  reactions: { playerId: string; emoji: string; timestamp: number }[];
}

export function PlayerRing({ players, activePlayerId, reactions }: PlayerRingProps) {
  const alivePlayers = players.filter(p => p.alive);
  const eliminatedPlayers = players.filter(p => !p.alive);

  return (
    <div className="px-3 py-2">
      {/* Active players */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {alivePlayers.map(player => {
          const isActive = player.id === activePlayerId;
          const reaction = reactions.find(r => r.playerId === player.id);

          return (
            <div
              key={player.id}
              className={`
                relative flex flex-col items-center min-w-[60px] px-2 py-1.5 rounded-lg
                transition-all duration-300
                ${isActive ? 'bg-(--bg-elevated) ring-2 ring-(--game-accent) scale-105' : 'bg-(--bg-card)'}
                ${player.folded ? 'opacity-50' : ''}
                ${!player.connected ? 'opacity-40' : ''}
              `}
            >
              {/* Reaction bubble */}
              {reaction && (
                <span className="absolute -top-3 text-lg animate-bounce">
                  {reaction.emoji}
                </span>
              )}

              {/* Position badges */}
              <div className="flex gap-0.5 mb-0.5">
                {player.isDealer && (
                  <span className="text-[10px] bg-(--game-secondary) text-black px-1 rounded-full font-bold">D</span>
                )}
                {player.isSmallBlind && (
                  <span className="text-[10px] bg-(--text-secondary) text-black px-1 rounded-full">SB</span>
                )}
                {player.isBigBlind && (
                  <span className="text-[10px] bg-(--text-primary) text-black px-1 rounded-full">BB</span>
                )}
              </div>

              {/* Avatar + Name */}
              <span className="text-lg">{player.avatar}</span>
              <span className="text-[11px] text-(--text-primary) truncate max-w-[56px]">
                {player.name}
              </span>

              {/* Chips */}
              <span className="text-[10px] text-(--game-secondary) font-mono">
                🪙{player.chips}
              </span>

              {/* Status indicators */}
              {player.folded && (
                <span className="text-[9px] text-(--text-muted) uppercase">Fold</span>
              )}
              {player.allIn && !player.folded && (
                <span className="text-[9px] text-(--danger) uppercase font-bold animate-pulse">
                  All In
                </span>
              )}
              {player.currentBet > 0 && !player.folded && !player.allIn && (
                <span className="text-[9px] text-(--text-secondary)">
                  Bet: {player.currentBet}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Eliminated players */}
      {eliminatedPlayers.length > 0 && (
        <div className="flex gap-1 mt-1 opacity-40">
          {eliminatedPlayers.map(player => (
            <span key={player.id} className="text-xs text-(--text-muted) line-through">
              {player.avatar}{player.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
