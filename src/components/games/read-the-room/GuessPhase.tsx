'use client';

import { useEffect, useState } from 'react';
import type { ReadTheRoomClientState, ReadTheRoomMember, ReadTheRoomTimer } from '@/types/games/read-the-room';
import { useReadTheRoomDial, useReadTheRoomDialHolder } from '@/lib/games/read-the-room/useReadTheRoom';
import Dial from './Dial';
import { ClueCard, FooterNote, MemberRow, Screen, TimerLine, displayName, findMember, findTeam, teamShortName } from './ui';

const ARM_MS = 3000;

interface GuessPhaseProps {
  state: ReadTheRoomClientState;
  myId: string | null;
  timer: ReadTheRoomTimer | null;
  pending: boolean;
  onMove: (value: number) => void;
  onRelease: (value: number) => void;
  onLockIn: () => void;
}

export default function GuessPhase({ state, myId, timer, pending, onMove, onRelease, onLockIn }: GuessPhaseProps) {
  const [peeking, setPeeking] = useState(false);
  const team = findTeam(state, state.activeTeamId);
  const giver = findMember(state, state.clueGiverId);
  const teamName = team ? teamShortName(team.name) : 'Their team';
  const role = state.myRole;
  const timerLabel = timer?.kind === 'away' ? `Nobody on ${teamName} can move it · locking in` : 'Time to lock in';

  const clueCard = (
    <ClueCard
      pair={state.pair}
      clue={state.clue}
      giverName={giver?.name ?? 'Someone'}
      mine={state.clueGiverId === myId}
      teamColor={team?.color}
      compact
    />
  );

  if (role === 'guesser') {
    const guessers = team ? team.members.filter(m => m.id !== state.clueGiverId) : [];
    return (
      <Screen footer={<LockInButton pending={pending} onConfirm={onLockIn} />}>
        {clueCard}
        <div className="mt-3">
          <LiveDial state={state} myId={myId} interactive onMove={onMove} onRelease={onRelease} />
        </div>
        <p className="mt-2 text-center text-xs text-(--text-muted) rtr-tall-only">
          Anyone on {teamName} can drag the needle. Talk it over, then lock it in.
        </p>
        <div className="mt-3">
          <GuesserRow members={guessers} teamColor={team?.color} myId={myId} />
        </div>
        <div className="mt-3">
          <TimerLine timer={timer} label={timerLabel} />
        </div>
      </Screen>
    );
  }

  if (role === 'clueGiver') {
    return (
      <Screen footer={<PeekButton peeking={peeking} onChange={setPeeking} />}>
        {clueCard}
        <div className="mt-3">
          <LiveDial state={state} myId={myId} target={peeking ? state.target : null} />
        </div>
        <div className="mt-3 text-center">
          <p className="text-sm font-semibold text-(--text-primary)">🤐 Stay quiet while your team talks</p>
          <p className="mt-0.5 text-xs text-(--text-muted)">The target is hidden so nobody can glance at your screen. Hold Peek to check it.</p>
        </div>
        <div className="mt-3">
          <TimerLine timer={timer} label={timerLabel} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen footer={<FooterNote>Get ready: is the target left or right of their needle?</FooterNote>}>
      {clueCard}
      <div className="mt-3">
        <LiveDial state={state} myId={myId} />
      </div>
      <p className="mt-3 text-center text-sm text-(--text-secondary)">
        {teamName} is turning the dial. You’ll call left or right next.
      </p>
      <div className="mt-3">
        <TimerLine timer={timer} label={timerLabel} />
      </div>
    </Screen>
  );
}

// ---- The dial, subscribed to the dial store so a drag re-renders only this ----

function LiveDial({ state, myId, interactive = false, onMove, onRelease, target = null }: {
  state: ReadTheRoomClientState;
  myId: string | null;
  interactive?: boolean;
  onMove?: (value: number) => void;
  onRelease?: (value: number) => void;
  target?: number | null;
}) {
  const dial = useReadTheRoomDial();
  const otherHolds = dial.holderId !== null && dial.holderId !== myId;
  return (
    <Dial
      pair={state.pair}
      position={dial.position}
      canDrag={interactive && !otherHolds}
      onMove={onMove}
      onRelease={onRelease}
      target={target}
      live={dial.holderId !== null}
      holderName={otherHolds ? displayName(state, dial.holderId, myId) : null}
      compact
    />
  );
}

/** The Guessers, with the Dial Holder highlighted (re-renders only when the holder changes). */
function GuesserRow({ members, teamColor, myId }: {
  members: ReadTheRoomMember[];
  teamColor?: string;
  myId: string | null;
}) {
  const holderId = useReadTheRoomDialHolder();
  return <MemberRow members={members} teamColor={teamColor} myId={myId} holderId={holderId} label="Guessers" />;
}

// ---- Two-tap lock-in, so one stray tap doesn't end the round ----

function LockInButton({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      className={`h-14 w-full rounded-2xl font-heading text-base font-semibold transition-[transform,opacity] active:scale-[0.97] disabled:opacity-40 ${
        armed ? 'bg-(--game-accent-strong) text-(--text-primary) rtr-lock-armed' : 'bg-(--game-accent) text-(--bg-primary)'
      }`}
      aria-label={armed ? 'Tap again to lock in the dial' : 'Lock in the dial'}
    >
      {pending ? 'Locking in…' : armed ? 'Tap again to lock in' : '🔒 Lock in'}
    </button>
  );
}

// ---- Hold to peek at the target (Clue-giver) ----

function PeekButton({ peeking, onChange }: { peeking: boolean; onChange: (peeking: boolean) => void }) {
  const isPeekKey = (key: string) => key === ' ' || key === 'Enter';
  return (
    <button
      type="button"
      aria-pressed={peeking}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onLostPointerCapture={() => onChange(false)}
      onKeyDown={e => {
        if (!isPeekKey(e.key)) return;
        e.preventDefault();
        onChange(true);
      }}
      onKeyUp={e => {
        if (isPeekKey(e.key)) onChange(false);
      }}
      onBlur={() => onChange(false)}
      onContextMenu={e => e.preventDefault()}
      className={`h-14 w-full select-none rounded-2xl border font-heading text-base font-semibold transition-colors [-webkit-touch-callout:none] ${
        peeking
          ? 'border-(--game-accent) bg-(--game-accent-dim) text-(--game-accent)'
          : 'border-(--border-light) bg-(--bg-card) text-(--text-primary)'
      }`}
    >
      {peeking ? '👀 Peeking…' : '👁 Hold to peek'}
    </button>
  );
}
