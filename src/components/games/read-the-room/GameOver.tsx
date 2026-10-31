'use client';

import type { ReadTheRoomAward, ReadTheRoomClientState } from '@/types/games/read-the-room';
import Confetti from '@/components/shared/Confetti';
import { Avatar, Screen, displayName, findMember, findTeam, listNames, teamShortName, teamStyle } from './ui';

interface GameOverProps {
  state: ReadTheRoomClientState;
  myId: string | null;
  isHost: boolean;
  hostName: string;
  /** Every team has 2+ players online */
  canRematch: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
  onLeaveRoom: () => void;
}

export default function GameOver({
  state, myId, isHost, hostName, canRematch, onRematch, onBackToLobby, onLeaveRoom,
}: GameOverProps) {
  const sorted = [...state.teams].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const leaders = sorted.filter(t => t.score === topScore);
  // A winner from the last reveal, otherwise whoever leads (ended early); shared top = a tie
  const winner = findTeam(state, state.winnerTeamId) ?? (leaders.length === 1 ? leaders[0] : undefined);
  const iWon = !!winner && winner.id === state.myTeamId && winner.score > 0;
  const rounds = state.recap.length;
  const target = state.settings.targetScore;

  const awards: { icon: string; title: string; award: ReadTheRoomAward; detail: string }[] = [];
  if (state.awards?.mindReader) {
    const v = state.awards.mindReader.value;
    awards.push({ icon: '🔮', title: 'Mind Reader', award: state.awards.mindReader, detail: `${v} point${v === 1 ? '' : 's'} from clues` });
  }
  if (state.awards?.dialHog) {
    const v = state.awards.dialHog.value;
    awards.push({ icon: '🎛️', title: 'Dial Hog', award: state.awards.dialHog, detail: `${v} second${v === 1 ? '' : 's'} on the dial` });
  }

  const footer = (
    <div className="space-y-2">
      {isHost ? (
        <>
          <button
            type="button"
            onClick={onRematch}
            disabled={!canRematch}
            className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            {canRematch ? '🔄 Rematch' : 'Rematch needs 2+ players online per team'}
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
  );

  return (
    <Screen footer={footer}>
      {iWon && <Confetti />}

      <div className="pb-5 pt-6 text-center">
        <p className="text-6xl animate-celebrate" aria-hidden="true">🏆</p>
        {winner ? (
          <h2 className="mt-3 text-2xl font-bold" style={{ color: winner.color }}>{teamShortName(winner.name)} wins!</h2>
        ) : (
          <h2 className="mt-3 text-2xl font-bold text-(--text-primary)">It’s a tie!</h2>
        )}
        <p className="mt-1 text-sm text-(--text-secondary)">
          {winner ? `${winner.score} points` : `${listNames(leaders.map(t => teamShortName(t.name)))} on ${topScore}`}
          {' · '}{rounds} round{rounds === 1 ? '' : 's'}
        </p>
      </div>

      {/* Standings, with each team's bar toward the target score */}
      <section className="rounded-2xl border border-(--border) bg-(--bg-card) p-4 animate-slide-up" aria-label="Final standings">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">Final standings · first to {target}</h3>
        <ol className="space-y-3.5">
          {sorted.map(team => {
            const place = sorted.filter(t => t.score > team.score).length;   // tied teams share a place
            return (
              <li key={team.id} style={teamStyle(team.color)}>
                <div className="flex items-center gap-2.5">
                  <span className="w-6 text-center text-lg" aria-hidden="true">{['🥇', '🥈', '🥉'][place] ?? `${place + 1}.`}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold rtr-team-text">
                      {teamShortName(team.name)}
                      {team.id === state.myTeamId && <span className="ml-1.5 text-xs font-normal text-(--text-muted)">your team</span>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-1 text-sm" aria-label={team.members.map(m => `${m.name}${m.left ? ' (left)' : !m.connected ? ' (away)' : ''}`).join(', ')}>
                      {team.members.map(m => (
                        <span key={m.id} className={m.left || !m.connected ? 'opacity-40 grayscale' : ''} title={m.name} aria-hidden="true">{m.avatar}</span>
                      ))}
                    </p>
                  </div>
                  <span className="text-xl font-bold tabular-nums text-(--text-primary)">{team.score}</span>
                </div>
                <div className="ml-8 mt-1.5 h-1.5 overflow-hidden rounded-full bg-(--bg-elevated)">
                  <div
                    className="rtr-bar-fill h-full rounded-full"
                    style={{ width: `${Math.min(100, (team.score / Math.max(1, target)) * 100)}%`, backgroundColor: team.color }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {awards.length > 0 && (
        <section className="mt-3 space-y-2" aria-label="Awards">
          {awards.map(({ icon, title, award, detail }) => {
            const first = findMember(state, award.playerIds[0] ?? null);
            const names = award.playerIds.map(id => displayName(state, id, myId));
            return (
              <div key={title} className="flex items-center gap-3 rounded-2xl border border-(--border) bg-(--bg-card) px-3.5 py-3 animate-slide-up">
                <span className="text-2xl" aria-hidden="true">{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">{title}</p>
                  <p className="text-sm font-semibold text-(--text-primary)">
                    {listNames(names)}
                    <span className="ml-1.5 text-xs font-normal text-(--text-secondary)">{detail}</span>
                  </p>
                </div>
                {first && award.playerIds.length === 1 && <Avatar emoji={first.avatar} size={36} />}
              </div>
            );
          })}
        </section>
      )}

      {/* Every round: who gave which clue, and how it went */}
      {rounds > 0 && (
        <section className="mt-3 rounded-2xl border border-(--border) bg-(--bg-card) p-3.5" aria-label="Round recap">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">Round by round</h3>
          <ol className="space-y-2.5">
            {state.recap.map(r => {
              const team = findTeam(state, r.teamId);
              const giver = r.clueGiverId === myId ? 'You' : r.clueGiverName;
              return (
                <li key={r.roundNumber} className="flex items-start gap-2.5" style={teamStyle(team?.color)}>
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                      r.points > 0 ? 'bg-(--game-accent-dim) text-(--game-accent)' : 'bg-(--bg-elevated) text-(--text-muted)'
                    }`}
                    aria-label={`${r.points} points`}
                  >
                    {r.points}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-(--text-primary)">
                      <span className="font-semibold">“{r.clue}”</span>
                      <span className="text-(--text-muted)"> · {r.pair.left} ↔ {r.pair.right}</span>
                    </p>
                    <p className="text-[11px] text-(--text-muted)">
                      <span className="rtr-team-text">{team ? teamShortName(team.name) : 'Team'}</span> · {giver}
                      {r.calls.filter(c => c.correct).map(c => {
                        const callTeam = findTeam(state, c.teamId);
                        return callTeam ? ` · ${teamShortName(callTeam.name)} +1` : '';
                      }).join('')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </Screen>
  );
}
