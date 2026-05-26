'use client';

import type { BattleshipPlayerInfo } from '@/types/games/battleship';

interface FleetStatusProps {
  players: BattleshipPlayerInfo[];
  myId: string;
}

export default function FleetStatus({ players, myId }: FleetStatusProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {players.map(player => {
        const isMe = player.id === myId;
        return (
          <div
            key={player.id}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${
              !player.alive
                ? 'bg-(--bg-card)/50 opacity-50'
                : isMe
                  ? 'bg-(--game-accent)/10 border border-(--game-accent)/30'
                  : 'bg-(--bg-card) border border-(--border)'
            }`}
          >
            <span>{player.avatar}</span>
            <span className={`font-medium ${player.alive ? 'text-(--text-primary)' : 'text-(--text-muted) line-through'}`}>
              {isMe ? 'You' : player.name}
            </span>
            <div className="flex gap-0.5">
              {Array.from({ length: player.totalShips }, (_, i) => (
                <span
                  key={i}
                  className={`inline-block w-1.5 h-3 rounded-sm ${
                    i < player.shipsRemaining
                      ? 'bg-(--game-accent)'
                      : 'bg-(--text-muted)/30'
                  }`}
                />
              ))}
            </div>
            {!player.connected && player.alive && (
              <span className="text-(--text-muted)">📡</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
