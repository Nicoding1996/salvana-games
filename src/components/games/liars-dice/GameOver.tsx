'use client';

import type { LiarsDicePlayerInfo, LiarsDiceStats } from '@/types/games/liars-dice';
import Confetti from '@/components/shared/Confetti';
import { Hearts } from './PlayerRing';

interface GameOverProps {
  players: LiarsDicePlayerInfo[];
  eliminationOrder: string[];
  winnerId: string | null;
  stats: Record<string, LiarsDiceStats>;
  rounds: number;
  myId: string | null;
  isHost: boolean;
  hostName: string;
  canRematch: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
  onLeaveRoom: () => void;
}

interface Award {
  icon: string;
  title: string;
  text: string;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function computeAwards(stats: Record<string, LiarsDiceStats>, nameOf: (id: string) => string | null): Award[] {
  const top = (key: keyof LiarsDiceStats): [string, number] | null => {
    let best: [string, number] | null = null;
    for (const [id, s] of Object.entries(stats)) {
      if (!nameOf(id) || s[key] <= 0) continue;
      if (!best || s[key] > best[1]) best = [id, s[key]];
    }
    return best;
  };
  const awards: Award[] = [];
  const detector = top('correctCalls');
  if (detector) awards.push({ icon: '🕵️', title: 'Lie Detector', text: `${nameOf(detector[0])} · ${detector[1]} bluff${detector[1] === 1 ? '' : 's'} caught` });
  const sniper = top('spotOnHits');
  if (sniper) awards.push({ icon: '🎯', title: 'Spot-on Sniper', text: `${nameOf(sniper[0])} · ${sniper[1]} exact call${sniper[1] === 1 ? '' : 's'}` });
  const caught = top('caught');
  if (caught) awards.push({ icon: '🤥', title: 'Caught Red-Handed', text: `${nameOf(caught[0])} · bluff called ${caught[1]}×` });
  return awards;
}

export default function GameOver({
  players, eliminationOrder, winnerId, stats, rounds, myId, isHost, hostName, canRematch,
  onRematch, onBackToLobby, onLeaveRoom,
}: GameOverProps) {
  const byId = new Map(players.map(p => [p.id, p]));
  const winner = winnerId ? byId.get(winnerId) : undefined;
  const iWon = !!myId && winnerId === myId;

  // Winner first, then the last player knocked out, and so on
  const standings = [
    ...(winner ? [winner] : []),
    ...[...eliminationOrder].reverse().map(id => byId.get(id)).filter((p): p is LiarsDicePlayerInfo => !!p && p.id !== winnerId),
  ];
  const nameOf = (id: string) => (id === myId ? 'You' : byId.get(id)?.name ?? null);
  const awards = computeAwards(stats, nameOf);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-4 ld-table">
      {iWon && <Confetti />}

      <div className="pb-5 pt-8 text-center">
        <div className="relative mx-auto w-fit animate-celebrate">
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-3xl" aria-hidden="true">👑</span>
          <span className="block text-6xl" aria-hidden="true">{winner?.avatar ?? '🎲'}</span>
        </div>
        <h2 className="mt-3 text-2xl font-bold text-(--text-primary)">
          {iWon ? 'You win!' : winner ? `${winner.name} wins!` : 'Game over'}
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Last one standing after {rounds} round{rounds === 1 ? '' : 's'}
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
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-(--text-primary)">
              {p.id === myId ? 'You' : p.name}
              {p.left && <span className="ml-1.5 text-xs font-normal text-(--text-muted)">left</span>}
            </span>
            {i === 0 ? <Hearts lives={p.lives} max={p.maxLives} /> : <span className="text-xs text-(--text-muted)">💀</span>}
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

      <div className="mt-auto space-y-2 pt-6 ld-safe-bottom">
        {isHost ? (
          <>
            <button
              type="button"
              onClick={onRematch}
              disabled={!canRematch}
              className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97] disabled:opacity-40"
            >
              {canRematch ? '🔄 Rematch' : 'Rematch needs 2+ players online'}
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
