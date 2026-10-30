'use client';

import { useEffect, useState } from 'react';
import type { Room } from '@/types/hub';
import type { StoryThiefClientState } from '@/types/games/story-thief';
import { ROUND_POT } from '@/types/games/story-thief';
import Confetti from '@/components/shared/Confetti';
import { Avatar, PhaseScreen, listNames, teamShortName, teamStyle } from './ui';

// Reveal pacing: drumroll → author → verdict → details + next-round button
const STAGE_TIMES_MS = [1400, 2300, 3300];

interface ResultPhaseProps {
  state: StoryThiefClientState;
  room: Room;
  playerId: string;
  isHost: boolean;
  onNextRound: () => void;
  /** The verdict is on screen: the header may show this round's points now */
  onVerdict: (round: number) => void;
}

const VERDICT_STAGE = 2;

export default function ResultPhase({ state, room, playerId, isHost, onNextRound, onVerdict }: ResultPhaseProps) {
  const [stage, setStage] = useState(0);
  const round = state.roundNumber;

  useEffect(() => {
    const timers = STAGE_TIMES_MS.map((ms, i) => setTimeout(() => {
      setStage(i + 1);
      if (i + 1 === VERDICT_STAGE) onVerdict(round);
    }, ms));
    return () => timers.forEach(clearTimeout);
  }, [onVerdict, round]);

  const result = state.lastVoteResult;
  if (!result) {
    return (
      <PhaseScreen center>
        <p className="text-sm text-(--text-secondary) animate-soft-pulse">Counting the votes…</p>
      </PhaseScreen>
    );
  }

  const bluffTeam = room.teams.find(t => t.id === result.bluffingTeamId);
  const author = room.players[result.realAuthorId];
  const members = state.bluffingTeamMembers;
  const myTeamId = room.players[playerId]?.teamId ?? null;
  const iWasBluffing = myTeamId === result.bluffingTeamId;
  const myVote = result.votes[playerId];
  const myTeamScored = !!myTeamId && (result.teamPointsAwarded[myTeamId] ?? 0) > 0;
  const winners = room.teams.filter(t => (result.teamPointsAwarded[t.id] ?? 0) > 0);
  const winnerColor = winners.length === 1 ? winners[0].color : undefined;
  const hostName = room.players[room.hostId]?.name ?? 'the host';
  const isAuthor = result.realAuthorId === playerId;

  let personal: { text: string; good: boolean } | null = null;
  if (isAuthor) {
    personal = result.guessersWon
      ? { text: '😬 They saw right through you', good: false }
      : { text: '🤫 Nobody believed it was you', good: true };
  } else if (iWasBluffing) {
    personal = result.guessersWon
      ? { text: '😬 They figured it out', good: false }
      : { text: '🎭 Your team fooled them!', good: true };
  } else if (myVote) {
    personal = myVote === result.realAuthorId
      ? { text: '🎉 You guessed right!', good: true }
      : { text: '😅 You were fooled', good: false };
  }

  // Fairness hint for the host: every team has bluffed the same number of times
  const teamCount = room.teams.length;
  const fairStop = state.roundNumber > 0 && state.roundNumber % teamCount === 0;

  const footer = stage >= 3 ? (
    isHost ? (
      <div className="space-y-2 animate-fade-in">
        {fairStop && (
          <p className="text-center text-xs text-(--game-accent)">
            ✨ Every team has bluffed {state.roundNumber / teamCount}×, a fair place to stop
          </p>
        )}
        <button
          type="button"
          onClick={onNextRound}
          className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97]"
        >
          ▶ Next round
        </button>
      </div>
    ) : (
      <p className="flex min-h-14 items-center justify-center rounded-2xl border border-dashed border-(--border-light) px-4 text-center text-sm text-(--text-secondary) animate-fade-in">
        Waiting for {hostName} to start the next round
      </p>
    )
  ) : undefined;

  return (
    <PhaseScreen footer={footer}>
      {stage >= 2 && myTeamScored && <Confetti />}

      {/* Drumroll, then the author */}
      <div className="flex min-h-[188px] flex-col items-center justify-center pt-4 text-center">
        {stage === 0 ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-(--text-muted)">The real author is…</p>
            <div className="mt-5 flex justify-center gap-3" aria-hidden="true">
              {members.map((m, i) => (
                <span key={m.id} className="st-drumroll" style={{ animationDelay: `${i * 120}ms` }}>
                  <Avatar emoji={m.avatar} size={52} teamColor={bluffTeam?.color} />
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="st-author-reveal">
              <Avatar emoji={author?.avatar ?? '❓'} size={96} teamColor={bluffTeam?.color} className="st-author-glow" />
            </span>
            <h2 className="mt-3 text-2xl font-bold text-(--text-primary) animate-fade-in">
              {isAuthor ? 'It was you!' : `It was ${result.realAuthorName}!`}
            </h2>
            <p className="mt-1 text-sm text-(--text-secondary) animate-fade-in">
              {result.correctVotes} of {result.totalVotes} guessed right
            </p>
          </>
        )}
      </div>

      {/* Verdict */}
      {stage >= 2 && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <div
            className="st-verdict w-full rounded-2xl border px-4 py-3 text-center"
            style={{
              ...teamStyle(winnerColor),
              borderColor: winnerColor ? `color-mix(in srgb, ${winnerColor} 45%, transparent)` : 'var(--border-light)',
              background: winnerColor ? `color-mix(in srgb, ${winnerColor} 12%, var(--bg-card))` : 'var(--bg-card)',
            }}
          >
            <p className="text-base font-bold text-(--text-primary)">
              {result.guessersWon
                ? `🔍 ${listNames(winners.map(t => teamShortName(t.name)))} cracked it!`
                : `🎭 ${bluffTeam ? teamShortName(bluffTeam.name) : 'The bluffers'} fooled them!`}
            </p>
            <p className="mt-0.5 text-sm font-semibold st-team-text">+{ROUND_POT} points</p>
          </div>
          {personal && (
            <span
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold animate-slide-up ${
                personal.good
                  ? 'border-(--success)/25 bg-(--success-dim) text-(--success)'
                  : 'border-(--danger)/25 bg-(--danger-dim) text-(--danger)'
              }`}
            >
              {personal.text}
            </span>
          )}
        </div>
      )}

      {/* Who voted for whom, then the standings */}
      {stage >= 3 && (
        <div className="mt-5 space-y-3 animate-slide-up">
          <p className="text-center text-xs italic text-(--text-muted)">
            🎤 {isAuthor ? 'Tell everyone the real story!' : `${result.realAuthorName}, tell everyone the real story!`}
          </p>

          <section className="rounded-2xl border border-(--border) bg-(--bg-card) p-3.5" aria-label="Votes">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">Votes</h3>
            <ul className="space-y-2">
              {members.map(m => {
                const voters = Object.entries(result.votes).filter(([, s]) => s === m.id).map(([v]) => v);
                const real = m.id === result.realAuthorId;
                return (
                  <li
                    key={m.id}
                    className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${real ? 'bg-(--success-dim) ring-1 ring-(--success)/30' : ''}`}
                  >
                    <Avatar emoji={m.avatar} size={32} teamColor={bluffTeam?.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-(--text-primary)">
                        {m.id === playerId ? 'You' : m.name}
                        {real && <span className="ml-1.5 text-xs font-semibold text-(--success)">✓ wrote it</span>}
                      </p>
                      <p className="text-[11px] text-(--text-muted)">
                        {voters.length === 0 ? 'No votes' : `${voters.length} vote${voters.length === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <div className="flex -space-x-1.5" aria-label={`Voted by ${voters.map(v => room.players[v]?.name ?? 'someone').join(', ')}`}>
                      {voters.map(v => (
                        <span key={v} className="st-voter-dot" title={room.players[v]?.name}>
                          {room.players[v]?.avatar ?? '❔'}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-(--border) bg-(--bg-card) p-3.5" aria-label="Standings">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">Standings</h3>
            <ul className="space-y-1.5">
              {[...room.teams]
                .sort((a, b) => (state.teamScores[b.id] ?? 0) - (state.teamScores[a.id] ?? 0))
                .map(team => {
                  const gained = result.teamPointsAwarded[team.id] ?? 0;
                  return (
                    <li key={team.id} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
                      <span className="font-semibold" style={{ color: team.color }}>{teamShortName(team.name)}</span>
                      {team.id === myTeamId && <span className="text-xs text-(--text-muted)">you</span>}
                      {gained > 0 && <span className="text-xs font-bold text-(--success) st-gain">+{gained}</span>}
                      <span className="ml-auto font-bold tabular-nums text-(--text-primary)">{state.teamScores[team.id] ?? 0}</span>
                    </li>
                  );
                })}
            </ul>
          </section>
        </div>
      )}
    </PhaseScreen>
  );
}
