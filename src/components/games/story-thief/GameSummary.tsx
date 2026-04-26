'use client';

import { useRouter } from 'next/navigation';
import type { Room } from '@/types/hub';

interface Props {
  scores: Record<string, number>;
  teamScores: Record<string, number>;
  room: Room;
}

export default function GameSummary({ scores, teamScores, room }: Props) {
  const router = useRouter();
  const sortedTeams = room.teams
    .map(t => ({ ...t, score: teamScores[t.id] || 0 }))
    .sort((a, b) => b.score - a.score);

  const winner = sortedTeams[0];
  const isTie = sortedTeams.length > 1 && sortedTeams[0].score === sortedTeams[1].score;

  // Superlatives — best detective (most correct guesses tracked in scores)
  const sortedDetectives = Object.entries(scores)
    .filter(([pid]) => room.players[pid])
    .sort(([, a], [, b]) => b - a);
  const bestDetective = sortedDetectives[0];

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      {/* Winner */}
      <div className="text-center pt-8 mb-8 animate-card-flip">
        <div className="text-5xl mb-4">🏆</div>
        {isTie ? (
          <>
            <h2 className="text-xl font-bold mb-1">It&apos;s a Tie!</h2>
            <p className="text-2xl font-bold text-(--text-secondary)">{winner?.score} pts</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-1" style={{ color: winner?.color }}>
              {winner?.name} Wins
            </h2>
            <p className="text-2xl font-bold">{winner?.score} pts</p>
          </>
        )}
      </div>

      {/* Final standings */}
      <div className="bg-(--bg-card) border border-(--border) rounded-xl p-4 mb-4 animate-slide-up">
        <p className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted) mb-3">Final Standings</p>
        <div className="space-y-3">
          {sortedTeams.map((team, i) => (
            <div key={team.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                <div>
                  <span className="font-medium text-sm" style={{ color: team.color }}>{team.name}</span>
                  <div className="flex gap-1 mt-0.5">
                    {team.playerIds.map(pid => {
                      const player = room.players[pid];
                      return player ? (
                        <span key={pid} className="text-sm" title={player.name}>{player.avatar}</span>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
              <span className="text-xl font-bold">{team.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Superlatives */}
      {bestDetective && bestDetective[1] > 0 && (
        <div className="bg-(--bg-card) border border-(--border) rounded-xl p-4 mb-4 animate-slide-up">
          <p className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted) mb-2">Awards</p>
          <div className="flex items-center gap-2 text-sm">
            <span>🔍</span>
            <span className="text-(--text-secondary)">Best Detective:</span>
            <span className="font-medium">
              {room.players[bestDetective[0]]?.avatar} {room.players[bestDetective[0]]?.name}
            </span>
            <span className="text-(--text-muted) text-xs">({bestDetective[1]} correct)</span>
          </div>
        </div>
      )}

      {/* Play Again / Leave */}
      <div className="mt-auto pb-4 space-y-2">
        <button
          onClick={() => window.location.reload()}
          className="w-full py-3.5 bg-(--brand) text-(--bg-primary) rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
        >
          Play Again
        </button>
        <button
          onClick={() => router.push('/')}
          className="w-full py-2.5 text-(--text-muted) text-xs hover:text-(--text-secondary) transition-colors"
        >
          Leave
        </button>
      </div>
    </div>
  );
}
