'use client';

import type { BattleshipPlayerInfo } from '@/types/games/battleship';
import Confetti from '@/components/shared/Confetti';
import { ShipPips } from './FleetStatus';

interface GameOverProps {
  players: BattleshipPlayerInfo[];
  eliminationOrder: string[];
  winnerId: string | null;
  turns: number;
  myId: string;
  isHost: boolean;
  hostName: string;
  canRematch: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
  onLeaveRoom: () => void;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function accuracy(p: BattleshipPlayerInfo): number {
  return p.stats.shots > 0 ? Math.round((p.stats.hits / p.stats.shots) * 100) : 0;
}

export default function GameOver({
  players, eliminationOrder, winnerId, turns, myId, isHost, hostName, canRematch,
  onRematch, onBackToLobby, onLeaveRoom,
}: GameOverProps) {
  const byId = new Map(players.map(p => [p.id, p]));
  const winner = winnerId ? byId.get(winnerId) : undefined;
  const isWinner = winnerId === myId;
  const name = (p: BattleshipPlayerInfo) => (p.id === myId ? 'You' : p.name);

  // Winner first, then the last fleet sunk, and so on
  const standings = [
    ...(winner ? [winner] : []),
    ...[...eliminationOrder].reverse().map(id => byId.get(id)).filter((p): p is BattleshipPlayerInfo => !!p && p.id !== winnerId),
  ];

  const awards: { icon: string; title: string; text: string }[] = [];
  const sharp = [...players].filter(p => p.stats.shots >= 3).sort((a, b) => accuracy(b) - accuracy(a))[0];
  if (sharp && sharp.stats.hits > 0) awards.push({ icon: '🎯', title: 'Sharpshooter', text: `${name(sharp)} · ${accuracy(sharp)}% of shots hit` });
  const admiral = [...players].sort((a, b) => b.stats.sunk - a.stats.sunk)[0];
  if (admiral && admiral.stats.sunk > 0) awards.push({ icon: '💥', title: 'Fleet Destroyer', text: `${name(admiral)} · ${admiral.stats.sunk} ship${admiral.stats.sunk === 1 ? '' : 's'} sunk` });

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-4 bs-table">
      {isWinner && <Confetti />}

      <div className="pb-5 pt-8 text-center">
        <p className="text-6xl animate-celebrate" aria-hidden="true">{isWinner ? '🏆' : winner?.avatar ?? '⚓'}</p>
        <h2 className="mt-3 text-2xl font-bold text-(--text-primary)">
          {isWinner ? 'Victory! Your fleet survived' : winner ? `${winner.name} wins!` : 'Game over'}
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {winner ? `${winner.shipsRemaining} ship${winner.shipsRemaining === 1 ? '' : 's'} still afloat · ` : ''}{turns} turn{turns === 1 ? '' : 's'}
        </p>
      </div>

      <ol className="space-y-1.5" aria-label="Final standings">
        {standings.map((p, i) => (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
              i === 0 ? 'border-(--game-accent)/40 bg-(--game-accent-dim)' : 'border-(--border) bg-(--bg-card)'
            } ${p.id === myId ? 'ring-1 ring-(--brand)/40' : ''}`}
          >
            <span className={`w-9 text-sm font-bold ${i === 0 ? 'text-(--game-accent)' : 'text-(--text-muted)'}`}>{ordinal(i + 1)}</span>
            <span className="text-xl" aria-hidden="true">{p.avatar}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-(--text-primary)">
                {name(p)}
                {p.left && <span className="ml-1.5 text-xs font-normal text-(--text-muted)">left</span>}
              </p>
              <p className="text-[11px] text-(--text-muted)">
                {p.stats.shots} shot{p.stats.shots === 1 ? '' : 's'} · {accuracy(p)}% hit · {p.stats.sunk} sunk
              </p>
            </div>
            {i === 0 && p.alive ? <ShipPips remaining={p.shipsRemaining} total={p.totalShips} /> : <span className="text-xs" aria-hidden="true">💀</span>}
          </li>
        ))}
      </ol>

      {awards.length > 0 && (
        <div className="mt-3 grid gap-1.5">
          {awards.map(a => (
            <div key={a.title} className="flex items-center gap-3 rounded-2xl border border-(--border) bg-(--bg-card) px-3 py-2.5">
              <span className="text-xl" aria-hidden="true">{a.icon}</span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">{a.title}</p>
                <p className="truncate text-sm text-(--text-primary)">{a.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto space-y-2 pt-6 bs-safe-bottom">
        {isHost ? (
          <>
            <button
              type="button"
              onClick={onRematch}
              disabled={!canRematch}
              className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97] disabled:opacity-40"
            >
              {canRematch ? '⚓ Rematch' : 'Rematch needs 2–4 players online'}
            </button>
            <button
              type="button"
              onClick={onBackToLobby}
              className="h-12 w-full rounded-2xl border border-(--border) bg-(--bg-card) text-sm text-(--text-secondary) transition-transform active:scale-[0.97]"
            >
              🏠 Back to Lobby
            </button>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-(--text-muted) animate-soft-pulse">Waiting for {hostName}…</p>
            <button
              type="button"
              onClick={onLeaveRoom}
              className="h-12 w-full rounded-2xl border border-(--border) bg-(--bg-card) text-sm text-(--text-secondary) transition-transform active:scale-[0.97]"
            >
              Leave Room
            </button>
          </>
        )}
      </div>
    </div>
  );
}
