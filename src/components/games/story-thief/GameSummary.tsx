'use client';

import type { Room } from '@/types/hub';
import type { StoryThiefClientState, StoryThiefPlayerStats } from '@/types/games/story-thief';
import Confetti from '@/components/shared/Confetti';
import { Avatar, PhaseScreen, teamShortName, teamStyle } from './ui';

interface GameSummaryProps {
  state: StoryThiefClientState;
  room: Room;
  playerId: string;
  isHost: boolean;
  onBackToLobby: () => void;
  onLeaveRoom: () => void;
}

interface Award {
  icon: string;
  title: string;
  playerId: string;
  detail: string;
}

/** Top player for one stat (ties go to whoever comes first), or null if nobody scored it. */
function leader(stats: Record<string, StoryThiefPlayerStats>, room: Room, key: keyof StoryThiefPlayerStats): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [pid, s] of Object.entries(stats)) {
    if (!room.players[pid] || s[key] <= 0) continue;
    if (!best || s[key] > best[1]) best = [pid, s[key]];
  }
  return best;
}

function computeAwards(state: StoryThiefClientState, room: Room): Award[] {
  const awards: Award[] = [];
  const detective = leader(state.stats, room, 'correct');
  if (detective) {
    awards.push({ icon: '🔍', title: 'Best Detective', playerId: detective[0], detail: `${detective[1]} correct guess${detective[1] === 1 ? '' : 'es'}` });
  }
  const bluffer = leader(state.stats, room, 'fooled');
  if (bluffer) {
    awards.push({ icon: '🎭', title: 'Master Bluffer', playerId: bluffer[0], detail: `fooled ${bluffer[1]} vote${bluffer[1] === 1 ? '' : 's'}` });
  }
  const pokerFace = leader(state.stats, room, 'authorFooled');
  if (pokerFace) {
    awards.push({ icon: '🤫', title: 'Poker Face', playerId: pokerFace[0], detail: `${pokerFace[1]} wrong vote${pokerFace[1] === 1 ? '' : 's'} on their own story` });
  }
  return awards;
}

export default function GameSummary({ state, room, playerId, isHost, onBackToLobby, onLeaveRoom }: GameSummaryProps) {
  const sorted = [...room.teams].sort((a, b) => (state.teamScores[b.id] ?? 0) - (state.teamScores[a.id] ?? 0));
  const top = sorted[0];
  const topScore = top ? state.teamScores[top.id] ?? 0 : 0;
  const tied = sorted.length > 1 && (state.teamScores[sorted[1].id] ?? 0) === topScore;
  const myTeamId = room.players[playerId]?.teamId ?? null;
  const iWon = !tied && !!top && top.id === myTeamId && topScore > 0;
  const maxScore = Math.max(1, topScore);
  const awards = computeAwards(state, room);
  const hostName = room.players[room.hostId]?.name ?? 'the host';
  const rounds = state.roundNumber;

  return (
    <PhaseScreen
      footer={(
        <div className="space-y-2">
          {isHost ? (
            <button
              type="button"
              onClick={onBackToLobby}
              className="h-14 w-full rounded-2xl bg-(--brand) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97]"
            >
              🏠 Back to Lobby
            </button>
          ) : (
            <p className="text-center text-sm text-(--text-muted) animate-soft-pulse">Waiting for {hostName}…</p>
          )}
          <button
            type="button"
            onClick={onLeaveRoom}
            className="h-11 w-full rounded-xl text-sm text-(--text-muted) transition-colors hover:text-(--text-secondary)"
          >
            Leave Room
          </button>
        </div>
      )}
    >
      {iWon && <Confetti />}

      <div className="pb-6 pt-6 text-center">
        <p className="text-6xl animate-celebrate" aria-hidden="true">🏆</p>
        {tied || !top ? (
          <h2 className="mt-3 text-2xl font-bold text-(--text-primary)">It’s a tie!</h2>
        ) : (
          <h2 className="mt-3 text-2xl font-bold" style={{ color: top.color }}>
            {teamShortName(top.name)} wins!
          </h2>
        )}
        <p className="mt-1 text-sm text-(--text-secondary)">
          {topScore} points{tied ? ' each' : ''} · {rounds} round{rounds === 1 ? '' : 's'} played
        </p>
      </div>

      <section className="rounded-2xl border border-(--border) bg-(--bg-card) p-4 animate-slide-up" aria-label="Final standings">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">Final standings</h3>
        <ol className="space-y-3.5">
          {sorted.map(team => {
            const score = state.teamScores[team.id] ?? 0;
            // Tied teams share a place
            const place = sorted.filter(t => (state.teamScores[t.id] ?? 0) > score).length;
            return (
              <li key={team.id} style={teamStyle(team.color)}>
                <div className="flex items-center gap-2.5">
                  <span className="w-6 text-center text-lg" aria-hidden="true">{['🥇', '🥈', '🥉'][place] ?? `${place + 1}.`}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold st-team-text">
                      {teamShortName(team.name)}
                      {team.id === myTeamId && <span className="ml-1.5 text-xs font-normal text-(--text-muted)">your team</span>}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-0.5" aria-label={team.playerIds.map(p => room.players[p]?.name).filter(Boolean).join(', ')}>
                      {team.playerIds.map(pid => room.players[pid] && (
                        <span key={pid} className="text-sm" title={room.players[pid].name}>{room.players[pid].avatar}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xl font-bold tabular-nums text-(--text-primary)">{score}</span>
                </div>
                <div className="ml-8 mt-1.5 h-1.5 overflow-hidden rounded-full bg-(--bg-elevated)">
                  <div className="st-bar-fill h-full rounded-full" style={{ width: `${(score / maxScore) * 100}%`, backgroundColor: team.color }} />
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {awards.length > 0 && (
        <section className="mt-3 space-y-2 animate-slide-up [animation-delay:150ms] [animation-fill-mode:backwards]" aria-label="Awards">
          {awards.map(a => {
            const p = room.players[a.playerId];
            return (
              <div key={a.title} className="flex items-center gap-3 rounded-2xl border border-(--border) bg-(--bg-card) px-3.5 py-3">
                <span className="text-2xl" aria-hidden="true">{a.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">{a.title}</p>
                  <p className="truncate text-sm font-semibold text-(--text-primary)">
                    {a.playerId === playerId ? 'You' : p?.name}
                    <span className="ml-1.5 text-xs font-normal text-(--text-secondary)">{a.detail}</span>
                  </p>
                </div>
                {p && <Avatar emoji={p.avatar} size={36} />}
              </div>
            );
          })}
        </section>
      )}
    </PhaseScreen>
  );
}
