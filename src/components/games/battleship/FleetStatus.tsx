'use client';

import type { BattleshipPlayerInfo } from '@/types/games/battleship';

export function ShipPips({ remaining, total, size = 'md' }: { remaining: number; total: number; size?: 'sm' | 'md' }) {
  return (
    <span className="flex gap-0.5" aria-label={`${remaining} of ${total} ships afloat`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`bs-pip ${i < remaining ? 'bs-pip-on' : ''} ${size === 'sm' ? 'h-2! w-1.5!' : ''}`} aria-hidden="true" />
      ))}
    </span>
  );
}

interface FleetStatusProps {
  players: BattleshipPlayerInfo[];
  myId: string;
  activePlayerId: string | null;
  selectedId: string | null;          // board being shown
  onSelect: (playerId: string) => void;
}

/** Every fleet in turn order. Tap one to look at (or aim at) their waters. */
export default function FleetStatus({ players, myId, activePlayerId, selectedId, onSelect }: FleetStatusProps) {
  return (
    <ol className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Fleets">
      {players.map(p => {
        const isMe = p.id === myId;
        const selected = p.id === selectedId;
        const onTurn = p.id === activePlayerId;
        return (
          <li key={p.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={selected}
              aria-label={`${isMe ? 'Your fleet' : `${p.name}'s fleet`}, ${p.alive ? `${p.shipsRemaining} ships afloat` : 'sunk'}${onTurn ? ', firing now' : ''}`}
              className={`bs-chip flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 py-1.5 ${selected ? 'bs-chip-target' : ''} ${onTurn ? 'bs-chip-turn' : ''} ${!p.alive ? 'opacity-50 grayscale' : ''}`}
            >
              <span className="text-base leading-none" aria-hidden="true">{p.alive ? p.avatar : '💀'}</span>
              <span className="flex flex-col items-start gap-0.5">
                <span className={`max-w-[72px] truncate text-[11px] font-semibold leading-none ${isMe ? 'text-(--brand)' : 'text-(--text-primary)'}`}>
                  {isMe ? 'You' : p.name}
                </span>
                {p.alive ? (
                  <ShipPips remaining={p.shipsRemaining} total={p.totalShips} size="sm" />
                ) : (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-(--text-muted)">{p.left ? 'left' : 'sunk'}</span>
                )}
              </span>
              {p.alive && !p.connected && (
                <span className="text-[9px] font-semibold uppercase text-(--danger)">away</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
