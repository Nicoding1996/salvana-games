'use client';

import type { Flip7PlayerInfo, Flip7RoundHistory } from '@/types/games/flip7';
import Confetti from '@/components/shared/Confetti';

interface GameOverProps {
  players: Flip7PlayerInfo[];
  winnerId: string | null;
  roundHistory: Flip7RoundHistory[];
  myId: string;
  isHost: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
  onLeaveRoom: () => void;
}

interface Award {
  icon: string;
  title: string;
  text: string;
}

function computeAwards(history: Flip7RoundHistory[], names: Map<string, string>): Award[] {
  let best: { id: string; score: number; round: number } | null = null;
  const busts = new Map<string, number>();
  const sevens = new Map<string, number>();

  for (const round of history) {
    for (const s of round.scores) {
      if (!names.has(s.playerId)) continue;
      if (s.busted) busts.set(s.playerId, (busts.get(s.playerId) ?? 0) + 1);
      if (s.flipSeven) sevens.set(s.playerId, (sevens.get(s.playerId) ?? 0) + 1);
      if (!s.busted && (!best || s.roundScore > best.score)) {
        best = { id: s.playerId, score: s.roundScore, round: round.round };
      }
    }
  }

  const awards: Award[] = [];
  if (best && best.score > 0) {
    awards.push({ icon: '🔥', title: 'Best round', text: `${names.get(best.id)} · ${best.score} in round ${best.round}` });
  }
  const topBusts = [...busts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topBusts) {
    awards.push({ icon: '💀', title: 'Daredevil', text: `${names.get(topBusts[0])} · busted ${topBusts[1]}×` });
  }
  if (sevens.size > 0) {
    const list = [...sevens.entries()].map(([id, n]) => `${names.get(id)}${n > 1 ? ` ×${n}` : ''}`);
    awards.push({ icon: '⭐', title: 'Flip 7 club', text: list.join(', ') });
  }
  return awards;
}

export default function GameOver({
  players, winnerId, roundHistory, myId, isHost, onRematch, onBackToLobby, onLeaveRoom,
}: GameOverProps) {
  const winner = players.find(p => p.id === winnerId);
  const sorted = [...players].sort((a, b) => b.cumulativeScore - a.cumulativeScore);
  const isWinner = winnerId === myId;
  const names = new Map(players.map(p => [p.id, p.id === myId ? 'You' : p.name]));
  const awards = computeAwards(roundHistory, names);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col p-4 f7-table">
      <Confetti />

      <div className="py-5 text-center">
        <p className="mb-3 text-6xl animate-celebrate" aria-hidden="true">{winner?.avatar ?? '🏆'}</p>
        <h2 className="text-2xl font-bold text-(--text-primary)">
          {isWinner ? 'You win!' : `${winner?.name ?? 'Someone'} wins!`}
        </h2>
        <p className="mt-1 text-sm font-semibold text-(--game-accent)">
          {winner?.cumulativeScore ?? 0} points in {roundHistory.length} round{roundHistory.length === 1 ? '' : 's'}
        </p>
      </div>

      <ol className="mb-4 space-y-2">
        {sorted.map((p, i) => (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-xl border p-3 ${
              p.id === winnerId ? 'border-(--game-accent)/40 bg-(--game-accent)/10' : 'border-(--border) bg-(--bg-card)'
            }`}
          >
            <span className="w-6 text-center text-sm font-bold text-(--text-muted)">
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
            </span>
            <span className="text-lg" aria-hidden="true">{p.avatar}</span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-(--text-primary)">
              {p.id === myId ? 'You' : p.name}
            </p>
            <p className="text-sm font-bold tabular-nums text-(--text-primary)">{p.cumulativeScore}</p>
          </li>
        ))}
      </ol>

      {awards.length > 0 && (
        <div className="mb-4 grid gap-2">
          {awards.map(a => (
            <div key={a.title} className="flex items-center gap-3 rounded-xl border border-(--border) bg-(--bg-card) px-3 py-2.5">
              <span className="text-xl" aria-hidden="true">{a.icon}</span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted)">{a.title}</p>
                <p className="truncate text-sm text-(--text-primary)">{a.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {roundHistory.length > 0 && (
        <div className="mb-4 flip7-card rounded-xl p-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-(--text-muted)">Round by round</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-(--text-muted)">
                  <th scope="col" className="py-1 pr-2 text-left font-medium">Player</th>
                  {roundHistory.map(r => (
                    <th key={r.round} scope="col" className="px-1.5 py-1 text-right font-medium">R{r.round}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => (
                  <tr key={p.id} className="border-t border-(--border)">
                    <th scope="row" className="max-w-[90px] truncate py-1.5 pr-2 text-left font-medium text-(--text-primary)">
                      {p.avatar} {p.id === myId ? 'You' : p.name}
                    </th>
                    {roundHistory.map(r => {
                      const s = r.scores.find(x => x.playerId === p.id);
                      return (
                        <td
                          key={r.round}
                          className="px-1.5 py-1.5 text-right"
                          style={{ color: !s ? 'var(--text-muted)' : s.busted ? 'var(--danger)' : s.flipSeven ? 'var(--game-accent)' : 'var(--text-secondary)' }}
                        >
                          {!s ? '–' : s.busted ? '💀' : s.flipSeven ? `★${s.roundScore}` : s.roundScore}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-auto space-y-2 f7-safe-bottom">
        {isHost ? (
          <>
            <button
              onClick={onRematch}
              className="w-full rounded-xl bg-(--game-accent) py-3.5 font-semibold text-(--bg-primary) transition-all active:scale-[0.97]"
            >
              🔄 Rematch
            </button>
            <button
              onClick={onBackToLobby}
              className="w-full rounded-xl border border-(--border) bg-(--bg-card) py-3 text-sm text-(--text-secondary) transition-all active:scale-[0.97]"
            >
              Back to Lobby
            </button>
          </>
        ) : (
          <>
            <p className="mb-2 text-center text-xs text-(--text-muted)">Waiting for host...</p>
            <button
              onClick={onLeaveRoom}
              className="w-full rounded-xl border border-(--border) bg-(--bg-card) py-3 text-sm text-(--text-secondary) transition-all active:scale-[0.97]"
            >
              Leave Room
            </button>
          </>
        )}
      </div>
    </div>
  );
}
