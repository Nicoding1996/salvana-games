'use client';

import type { ReadTheRoomClientState, ReadTheRoomSide, ReadTheRoomTimer } from '@/types/games/read-the-room';
import Dial from './Dial';
import { ClueCard, FooterNote, Screen, TimerLine, displayName, findMember, findTeam, listNames, teamShortName, teamStyle } from './ui';

interface CallPhaseProps {
  state: ReadTheRoomClientState;
  myId: string | null;
  timer: ReadTheRoomTimer | null;
  pending: boolean;
  onPick: (side: ReadTheRoomSide) => void;
  onLock: () => void;
}

const SIDE_LABEL: Record<ReadTheRoomSide, string> = { left: 'Left', right: 'Right' };

export default function CallPhase({ state, myId, timer, pending, onPick, onLock }: CallPhaseProps) {
  const activeTeam = findTeam(state, state.activeTeamId);
  const activeName = activeTeam ? teamShortName(activeTeam.name) : 'their team';
  const giver = findMember(state, state.clueGiverId);
  const myCall = state.calls.find(c => c.teamId === state.myTeamId);
  const canCall = state.myRole === 'opponent' && !!myCall && !myCall.locked;
  const onActiveTeam = !!state.myTeamId && state.myTeamId === state.activeTeamId;

  const callingNames = state.calls
    .filter(c => !c.locked)
    .flatMap(c => {
      const team = findTeam(state, c.teamId);
      return team ? [teamShortName(team.name)] : [];
    });

  const status = (
    <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Calls">
      {state.calls.map(call => {
        const team = findTeam(state, call.teamId);
        if (!team) return null;
        return (
          <li
            key={call.teamId}
            className="rtr-score-chip flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold"
            style={teamStyle(team.color)}
          >
            <span className="rtr-team-text">{teamShortName(team.name)}</span>
            <span className="text-(--text-secondary)">{call.locked ? '🔒 locked in' : 'deciding…'}</span>
          </li>
        );
      })}
    </ul>
  );

  let body;
  let footer;
  if (canCall && myCall) {
    const picker = myCall.pickedById ? displayName(state, myCall.pickedById, myId) : null;
    body = (
      <div className="mt-3 text-center">
        {/* One line on a 375px phone, so it clears the footer on short screens */}
        <h2 className="text-base font-bold text-balance text-(--text-primary)">Is the target left or right of {activeName}’s needle?</h2>
        <p className="mt-1 text-sm text-(--text-secondary) rtr-tall-only">
          Guess which side the real target is on. Your team makes one call, and a correct call gives your team +1.
        </p>
      </div>
    );
    footer = (
      <div className="space-y-2">
        {/* The countdown sits with the buttons, so it stays in view on short phones */}
        <TimerLine timer={timer} label="Time to call" />
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Your team's call">
          {(['left', 'right'] as const).map(side => {
            const on = myCall.pick === side;
            return (
              <button
                key={side}
                type="button"
                aria-pressed={on}
                onClick={() => onPick(side)}
                className={`rtr-side h-14 rounded-2xl font-heading text-base font-semibold text-(--text-primary) ${on ? 'rtr-side-on' : ''}`}
              >
                {side === 'left' ? '◀ Left' : 'Right ▶'}
              </button>
            );
          })}
        </div>
        <p className="text-center text-[11px] text-(--text-muted)" role="status">
          {picker ? `${picker} picked ${SIDE_LABEL[myCall.pick ?? 'left']}` : 'Anyone on your team can pick'}
        </p>
        <button
          type="button"
          onClick={onLock}
          disabled={!myCall.pick || pending}
          className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-[transform,opacity] active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
        >
          {pending ? 'Locking in…' : myCall.pick ? `🔒 Lock in ${SIDE_LABEL[myCall.pick]}` : 'Pick a side first'}
        </button>
      </div>
    );
  } else {
    const waitingText = myCall?.locked
      ? `🔒 Your team called ${SIDE_LABEL[myCall.pick ?? 'left']}`
      : callingNames.length > 0
        ? `${listNames(callingNames)} ${callingNames.length === 1 ? 'is' : 'are'} deciding: is the target left or right of ${onActiveTeam ? 'your' : `${activeName}’s`} needle?`
        : 'Every call is in';
    body = (
      <div className="mt-3 space-y-3 text-center">
        <p className="text-sm font-semibold text-(--text-primary)">{waitingText}</p>
        {status}
      </div>
    );
    footer = <FooterNote>{onActiveTeam ? 'Your needle is locked. The reveal is next.' : 'Waiting for the other calls…'}</FooterNote>;
  }

  return (
    <Screen footer={footer}>
      <ClueCard
        pair={state.pair}
        clue={state.clue}
        giverName={giver?.name ?? 'Someone'}
        mine={state.clueGiverId === myId}
        teamColor={activeTeam?.color}
        compact
      />
      <div className="mt-3">
        <Dial pair={state.pair} position={state.dial.position} compact />
        <p className="mt-1 text-center text-[11px] text-(--text-muted)">🔒 {activeName}’s needle is locked</p>
      </div>
      {body}
      {!canCall && (
        <div className="mt-3">
          <TimerLine timer={timer} label="Time to call" />
        </div>
      )}
    </Screen>
  );
}
