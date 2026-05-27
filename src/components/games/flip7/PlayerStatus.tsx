'use client';

import type { Flip7PlayerInfo } from '@/types/games/flip7';

interface PlayerStatusProps {
  players: Flip7PlayerInfo[];
  activePlayerId: string | null;
  myId: string;
}

export default function PlayerStatus({ players, activePlayerId, myId }: PlayerStatusProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {players.map((player) => {
        const isActive = player.id === activePlayerId;
        const isMe = player.id === myId;

        const statusIcon = player.roundStatus === 'busted' ? '💀'
          : player.roundStatus === 'frozen' ? '❄️'
          : player.roundStatus === 'stayed' ? '✓'
          : !player.connected ? '⚠️'
          : null;

        return (
          <div
            key={player.id}
            className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
              isActive
                ? 'border-(--game-accent) bg-(--game-accent)/10 shadow-[0_0_8px_rgba(163,230,53,0.3)]'
                : isMe
                  ? 'border-(--border-light) bg-(--bg-elevated)'
                  : 'border-(--border) bg-(--bg-card)'
            } ${player.roundStatus === 'busted' ? 'opacity-50' : ''}`}
          >
            <span className="text-base">{player.avatar}</span>
            <div className="flex flex-col min-w-[50px]">
              <span className="text-[11px] font-semibold text-(--text-primary) leading-tight truncate max-w-[70px]">
                {isMe ? 'You' : player.name}
              </span>
              <span className="text-[10px] text-(--text-muted) leading-tight">
                <span className="font-semibold text-(--text-secondary)">{player.cumulativeScore}</span>pts · {player.cardCount}🃏
              </span>
            </div>
            {statusIcon && <span className="text-xs">{statusIcon}</span>}
          </div>
        );
      })}
    </div>
  );
}
