'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ReadTheRoomClientState, ReadTheRoomPair, ReadTheRoomTimer } from '@/types/games/read-the-room';
import { RTR_CLUE_MAX, clueLength, normalizeClue } from '@/types/games/read-the-room';
import TimerBar from '@/components/shared/TimerBar';
import Dial from './Dial';
import { Avatar, MemberRow, Screen, findMember, findTeam, teamShortName, teamStyle } from './ui';

interface CluePhaseProps {
  state: ReadTheRoomClientState;
  myId: string | null;
  isHost: boolean;
  timer: ReadTheRoomTimer | null;
  pending: boolean;
  onGiveClue: (pairId: number, clue: string) => void;
  onSkip: () => void;
}

export default function CluePhase({ state, myId, isHost, timer, pending, onGiveClue, onSkip }: CluePhaseProps) {
  if (state.myRole === 'clueGiver' && state.offeredPairs && state.offeredPairs.length > 0 && state.target !== null) {
    return (
      <ClueComposer
        key={state.offeredPairs.map(p => p.id).join('-')}
        pairs={state.offeredPairs}
        target={state.target}
        teamColor={findTeam(state, state.activeTeamId)?.color}
        isHost={isHost}
        pending={pending}
        onGiveClue={onGiveClue}
        onSkip={onSkip}
      />
    );
  }
  return <WaitingForClue state={state} myId={myId} isHost={isHost} timer={timer} onSkip={onSkip} />;
}

// ---- The Clue-giver: pick a scale, look at the target, type the clue ----

function ClueComposer({ pairs, target, teamColor, isHost, pending, onGiveClue, onSkip }: {
  pairs: ReadTheRoomPair[];
  target: number;
  teamColor?: string;
  isHost: boolean;
  pending: boolean;
  onGiveClue: (pairId: number, clue: string) => void;
  onSkip: () => void;
}) {
  const [pairId, setPairId] = useState(pairs[0].id);
  const [text, setText] = useState('');
  const pair = pairs.find(p => p.id === pairId) ?? pairs[0];
  const clue = normalizeClue(text);
  const length = clueLength(clue);
  const tooLong = length > RTR_CLUE_MAX;
  const canSend = length > 0 && !tooLong && !pending;

  // The typed clue stays in the field until the server accepts it (this screen then goes away)
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSend) onGiveClue(pair.id, clue);
  };

  const footer = (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex gap-2">
        <label htmlFor="rtr-clue" className="sr-only">Your clue</label>
        <input
          id="rtr-clue"
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={RTR_CLUE_MAX}
          placeholder="Type your clue"
          autoComplete="off"
          enterKeyHint="send"
          className="rtr-input h-14 min-w-0 flex-1 rounded-2xl px-4 text-(--text-primary) placeholder:text-(--text-muted)"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="h-14 shrink-0 rounded-2xl bg-(--game-accent) px-5 font-heading text-base font-semibold text-(--bg-primary) transition-[transform,opacity] active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
        >
          {pending ? 'Sending…' : 'Give clue'}
        </button>
      </div>
      <p className="flex justify-between gap-3 px-1 text-[11px] text-(--text-muted)">
        <span>No numbers, and no words from the scale</span>
        <span className={`tabular-nums ${tooLong ? 'text-(--danger)' : ''}`}>{length}/{RTR_CLUE_MAX}</span>
      </p>
    </form>
  );

  return (
    <Screen footer={footer}>
      <div className="pt-1 text-center animate-slide-up">
        <h2 className="text-lg font-bold text-(--text-primary)">🎯 You’re giving the clue</h2>
        <p className="mt-0.5 text-sm text-(--text-secondary)">
          Pick a scale, then type a clue that points to the target.
          <span className="rtr-tall-only"> Keep your screen to yourself.</span>
        </p>
      </div>

      <div role="radiogroup" aria-label="Pick a scale" className="mt-3 grid gap-2">
        {pairs.map(p => {
          const on = p.id === pair.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPairId(p.id)}
              className={`rtr-choice flex min-h-12 items-center justify-between gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-(--text-primary) ${on ? 'rtr-choice-on' : ''}`}
            >
              <span className="min-w-0 flex-1 text-left">{p.left}</span>
              <span className="shrink-0 text-(--text-muted)" aria-label="to">↔</span>
              <span className="min-w-0 flex-1 text-right">{p.right}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4" style={teamStyle(teamColor)}>
        <Dial pair={pair} position={target} target={target} compact />
        <p className="mt-2 text-center text-xs text-(--text-muted)">The needle points at the target. Only you can see it.</p>
      </div>

      {isHost && (
        <button
          type="button"
          onClick={onSkip}
          className="mx-auto mt-3 flex min-h-11 items-center rounded-full px-4 text-xs font-semibold text-(--text-muted) transition-colors hover:text-(--text-secondary)"
        >
          ⏭ Pass the clue to a teammate
        </button>
      )}
    </Screen>
  );
}

// ---- Everyone else: who is thinking of a clue ----

function WaitingForClue({ state, myId, isHost, timer, onSkip }: {
  state: ReadTheRoomClientState;
  myId: string | null;
  isHost: boolean;
  timer: ReadTheRoomTimer | null;
  onSkip: () => void;
}) {
  const team = findTeam(state, state.activeTeamId);
  const giver = findMember(state, state.clueGiverId);
  const name = giver?.name ?? 'Someone';
  const away = timer?.kind === 'away';
  const myTeamUp = !!state.myTeamId && state.myTeamId === state.activeTeamId;
  const teamName = team ? teamShortName(team.name) : 'Their team';

  const footer = isHost ? (
    <button
      type="button"
      onClick={onSkip}
      className="h-12 w-full rounded-2xl border border-(--border) bg-(--bg-card) text-sm font-semibold text-(--text-secondary) transition-transform active:scale-[0.97]"
    >
      ⏭ Skip {name}
    </button>
  ) : undefined;

  return (
    <Screen footer={footer}>
      <div className="flex flex-col items-center pt-2 text-center animate-fade-in" style={teamStyle(team?.color)}>
        <Avatar emoji={giver?.avatar ?? '🤔'} size={64} teamColor={team?.color} dim={away} />
        <h2 className="mt-3 text-lg font-bold text-(--text-primary)">
          {away ? `${name} is away` : `🤔 ${name} is thinking of a clue`}
        </h2>
        <p className="mt-0.5 text-sm text-(--text-secondary)">
          {myTeamUp ? 'Your team guesses this round.' : `${teamName}’s turn. You’ll call left or right after.`}
        </p>
        {away && timer && (
          <div className="mt-3 w-full max-w-xs">
            <p className="mb-1 text-xs text-(--text-muted)">The clue passes to a teammate in {timer.secondsLeft}s</p>
            <TimerBar seconds={timer.secondsLeft} total={timer.total} />
          </div>
        )}
      </div>

      <div className="mt-4">
        <Dial pair={null} position={50} thinking compact />
      </div>

      {team && (
        <div className="mt-4">
          <MemberRow members={team.members} teamColor={team.color} myId={myId} clueGiverId={state.clueGiverId} label={`${team.name} players`} />
        </div>
      )}
    </Screen>
  );
}
