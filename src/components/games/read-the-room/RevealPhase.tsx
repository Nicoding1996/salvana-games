'use client';

import { useEffect, useState } from 'react';
import type { ReadTheRoomClientState, ReadTheRoomRoundResult } from '@/types/games/read-the-room';
import {
  RTR_NEXT_ROUND_LOCK_MS,
  RTR_REVEAL_CALLS_MS,
  RTR_REVEAL_POINTS_MS,
  RTR_REVEAL_SCORES_MS,
} from '@/types/games/read-the-room';
import Confetti from '@/components/shared/Confetti';
import Dial from './Dial';
import { ClueCard, FooterNote, Screen, displayName, findTeam, teamShortName, teamStyle } from './ui';

// ---- Reveal staging, shared with the header scoreboard ----

/** Stages: 0 zone opens · 1 points · 2 calls · 3 scores · 4 next-round button */
export const REVEAL_STAGE = { points: 1, calls: 2, scores: 3, done: 4 } as const;
const STAGE_TIMES_MS = [RTR_REVEAL_POINTS_MS, RTR_REVEAL_CALLS_MS, RTR_REVEAL_SCORES_MS, RTR_NEXT_ROUND_LOCK_MS];

function stageAt(elapsedMs: number): number {
  return STAGE_TIMES_MS.filter(ms => elapsedMs >= ms).length;
}

/**
 * Where the reveal is, counted from when it started on the server (`elapsedMs`), so a phone
 * that arrives late jumps ahead. `key` is null outside a reveal; a new key starts over.
 */
export function useRevealStage(key: string | null, elapsedMs: number): number {
  const [current, setCurrent] = useState({ key, stage: key ? stageAt(elapsedMs) : 0 });

  // A new reveal: start from where the server says it is (adjusting state while rendering)
  let stage = current.stage;
  if (current.key !== key) {
    stage = key ? stageAt(elapsedMs) : 0;
    setCurrent({ key, stage });
  }

  useEffect(() => {
    if (!key) return;
    const timers = STAGE_TIMES_MS.map((ms, i) => setTimeout(() => {
      setCurrent(c => (c.key === key && c.stage < i + 1 ? { key, stage: i + 1 } : c));
    }, Math.max(0, ms - elapsedMs)));
    return () => timers.forEach(clearTimeout);
  }, [key, elapsedMs]);

  return stage;
}

// ---- The reveal ----

interface RevealPhaseProps {
  state: ReadTheRoomClientState;
  myId: string | null;
  isHost: boolean;
  hostName: string;
  stage: number;
  onNextRound: () => void;
}

const POINTS_TITLE: Record<ReadTheRoomRoundResult['points'], string> = {
  4: 'Bullseye!',
  3: 'So close!',
  2: 'In the zone',
  0: 'Missed',
};

function personalLine(state: ReadTheRoomClientState, result: ReadTheRoomRoundResult): { text: string; good: boolean } | null {
  if (state.myTeamId === result.teamId) {
    if (result.points === 4) return { text: '🎉 Bullseye! Your team scored 4', good: true };
    if (result.points > 0) return { text: `👏 Your team scored ${result.points}`, good: true };
    return { text: '😅 Missed this time', good: false };
  }
  const myCall = result.calls.find(c => c.teamId === state.myTeamId);
  if (!myCall) return null;
  if (myCall.pick === null) return { text: '⏱️ Your team didn’t call', good: false };
  if (result.points === 4) return { text: '😮 They hit the bullseye', good: false };
  return myCall.correct
    ? { text: '🕵️ Your call was right: +1', good: true }
    : { text: '😬 Wrong side this time', good: false };
}

export default function RevealPhase({ state, myId, isHost, hostName, stage, onNextRound }: RevealPhaseProps) {
  const result = state.lastResult;
  if (!result) {
    return (
      <Screen center>
        <p className="text-sm text-(--text-secondary) animate-soft-pulse">Revealing…</p>
      </Screen>
    );
  }

  const team = findTeam(state, result.teamId);
  const teamName = team ? teamShortName(team.name) : 'The team';
  const onActiveTeam = state.myTeamId === result.teamId;
  const personal = personalLine(state, result);
  const winner = findTeam(state, state.winnerTeamId);
  const nextTeam = findTeam(state, state.nextUp?.teamId ?? null);
  const bullseye = result.points === 4;

  const footer = stage >= REVEAL_STAGE.done ? (
    <div className="animate-fade-in">
      {isHost ? (
        <button
          type="button"
          onClick={onNextRound}
          className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97]"
        >
          {winner ? '🏆 Final results' : '▶ Next round'}
        </button>
      ) : (
        <FooterNote>{winner ? `Waiting for ${hostName} to show the final results` : `Waiting for ${hostName} to start the next round`}</FooterNote>
      )}
    </div>
  ) : undefined;

  return (
    <Screen footer={footer}>
      {stage >= REVEAL_STAGE.scores && onActiveTeam && bullseye && <Confetti />}

      <ClueCard
        pair={result.pair}
        clue={result.clue}
        giverName={result.clueGiverName}
        mine={result.clueGiverId === myId}
        teamColor={team?.color}
        compact
      />

      <div className="mt-3">
        <Dial
          pair={result.pair}
          position={result.needle}
          target={result.target}
          zoneOpening={stage === 0}
          showHit={stage >= REVEAL_STAGE.points}
          compact
        />
      </div>

      {/* Points for the team that guessed */}
      <div className="mt-3 flex min-h-[72px] flex-col items-center justify-center text-center" style={teamStyle(team?.color)}>
        {stage >= REVEAL_STAGE.points ? (
          <div className="rtr-points-pop" role="status">
            <p className={`font-heading text-4xl font-bold tabular-nums ${result.points > 0 ? 'text-(--game-accent)' : 'text-(--text-muted)'}`}>
              {result.points > 0 ? `+${result.points}` : '0'}
            </p>
            <p className="text-sm font-semibold text-(--text-primary)">
              {POINTS_TITLE[result.points]} <span className="rtr-team-text">{teamName}</span> scores {result.points}
            </p>
          </div>
        ) : (
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-(--text-muted) animate-soft-pulse">The target is…</p>
        )}
      </div>

      {/* The other teams' calls */}
      {stage >= REVEAL_STAGE.calls && result.calls.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-center text-[11px] text-(--text-muted)">
            {bullseye
              ? 'No call points after a bullseye'
              : result.side ? `The target was ${result.side} of the needle` : 'The needle was dead on the target'}
          </p>
          <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Calls">
            {result.calls.map((call, i) => {
              const callTeam = findTeam(state, call.teamId);
              if (!callTeam) return null;
              const name = teamShortName(callTeam.name);
              const text = call.pick === null ? `${name} didn’t call` : `${name} called ${call.pick === 'left' ? 'Left' : 'Right'}`;
              return (
                <li
                  key={call.teamId}
                  className="rtr-score-chip rtr-call-in flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold"
                  style={{ ...teamStyle(callTeam.color), animationDelay: `${i * 120}ms` }}
                >
                  <span className="rtr-team-text">{text}</span>
                  {/* After a bullseye a call scores nothing either way, so it gets no mark */}
                  {call.pick !== null && !bullseye && (
                    <span className={call.correct ? 'text-(--success)' : 'text-(--text-muted)'}>{call.correct ? '✓ +1' : '✗'}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Personal line, then a winner or a tie */}
      {stage >= REVEAL_STAGE.scores && (
        <div className="mt-3 flex flex-col items-center gap-2 animate-slide-up">
          {personal && (
            <span
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                personal.good
                  ? 'border-(--success)/25 bg-(--success-dim) text-(--success)'
                  : 'border-(--border-light) bg-(--bg-card) text-(--text-secondary)'
              }`}
            >
              {personal.text}
            </span>
          )}
          {winner && (
            <p className="text-lg font-bold animate-celebrate" style={{ color: winner.color }}>
              🏆 {teamShortName(winner.name)} wins!
            </p>
          )}
          {!winner && state.tiedAtTop && (
            <p className="text-sm font-semibold text-(--game-secondary)">Tied at the top: play on</p>
          )}
          {stage >= REVEAL_STAGE.done && state.nextUp && nextTeam && (
            <p className="text-center text-xs text-(--text-muted) animate-fade-in">
              Next up: <span className="font-semibold" style={{ color: nextTeam.color }}>{teamShortName(nextTeam.name)}</span>
              {' · '}
              {state.nextUp.clueGiverId === myId ? 'you give the clue' : `${displayName(state, state.nextUp.clueGiverId, myId)} gives the clue`}
            </p>
          )}
        </div>
      )}
    </Screen>
  );
}
