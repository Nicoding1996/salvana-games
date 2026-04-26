'use client';

import type { Room } from '@/types/hub';

interface Props {
  scores: Record<string, number>;
  teamScores: Record<string, number>;
  room: Room;
}

export default function GameSummary({ scores, teamScores, room }: Props) {
  // Sort players by score
  const sortedPlayers = Object.entries(scores)
    .sort(([, a], [, b]) => b - a);

  // Sort teams by score
  const sortedTeams = room.teams
    .map(t => ({ ...t, score: teamScores[t.id] || 0 }))
    .sort((a, b) => b.score - a.score);

  const winner = sortedTeams[0];

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      {/* Winner */}
      <div className="text-center mb-6 animate-card-flip">
        <div className="text-5xl mb-3">🏆</div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: winner?.color }}>
          {winner?.name} Wins!
        </h2>
        <p className="text-3xl font-bold">{winner?.score} pts</p>
      </div>

      {/* Team Scores */}
      <div className="bg-(--bg-card) rounded-2xl p-4 mb-4 animate-slide-up">
        <h3 className="text-sm font-semibold text-(--text-secondary) mb-3">Team Standings</h3>
        <div className="space-y-2">
          {sortedTeams.map((team, i) => (
            <div key={team.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                <span style={{ color: team.color }}>{team.name}</span>
              </div>
              <span className="font-bold">{team.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Individual Scores */}
      <div className="bg-(--bg-card) rounded-2xl p-4 mb-4 animate-slide-up">
        <h3 className="text-sm font-semibold text-(--text-secondary) mb-3">Player Scores</h3>
        <div className="space-y-2">
          {sortedPlayers.map(([pid, score], i) => {
            const player = room.players[pid];
            if (!player) return null;
            return (
              <div key={pid} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                  <span className="text-lg">{player.avatar}</span>
                  <span>{player.name}</span>
                </div>
                <span className="font-bold">{score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Play Again */}
      <div className="mt-auto pb-4">
        <button
          onClick={() => window.location.reload()}
          className="w-full py-4 bg-(--accent) hover:bg-[#d63d56] rounded-2xl text-lg font-semibold transition-all active:scale-95"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
