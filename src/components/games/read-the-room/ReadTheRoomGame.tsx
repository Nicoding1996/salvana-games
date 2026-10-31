'use client';

import { useCallback, useState } from 'react';
import type { useRoom } from '@/lib/hub/useRoom';
import { useReadTheRoom } from '@/lib/games/read-the-room/useReadTheRoom';
import type { ReadTheRoomClientState } from '@/types/games/read-the-room';
import { RTR_MIN_TEAM_SIZE } from '@/types/games/read-the-room';
import RulesSheet from '@/components/shared/RulesSheet';
import EndGameButton from '@/components/shared/EndGameButton';
import CluePhase from './CluePhase';
import GuessPhase from './GuessPhase';
import CallPhase from './CallPhase';
import RevealPhase, { REVEAL_STAGE, useRevealStage } from './RevealPhase';
import GameOver from './GameOver';
import { Scoreboard, Screen, findTeam, listNames, teamShortName } from './ui';

interface ReadTheRoomGameProps {
  roomHook: ReturnType<typeof useRoom>;
}

// The first-round quick rules are shown once per page load.
let quickRulesSeen = false;

const ROLE_LINE: Record<ReadTheRoomClientState['myRole'], string | null> = {
  clueGiver: 'You give the clue this round.',
  guesser: 'Your team guesses this round.',
  opponent: 'Your team calls left or right this round.',
  watcher: null,
};

function QuickRules({ state, onClose }: { state: ReadTheRoomClientState; onClose: () => void }) {
  const roleLine = ROLE_LINE[state.myRole];
  const rules: [string, string][] = [
    ['🎯', 'One player sees a hidden target on a scale between two opposites.'],
    ['💬', 'They type a short clue. No numbers, and no words from the scale.'],
    ['🧭', 'Their team drags the shared dial to where they think the target is, then locks it in.'],
    ['↔️', 'The other teams call: is the target left or right of the needle?'],
    ['🏆', `4, 3 or 2 points for landing close, +1 for a correct call. First to ${state.settings.targetScore} wins.`],
  ];
  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="rtr-quick-rules">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div className="rtr-card relative w-full max-w-lg rounded-t-3xl px-5 pt-5 rtr-safe-bottom rtr-sheet-up">
        <h2 id="rtr-quick-rules" className="text-center text-lg font-bold text-(--text-primary)">🧭 How Read the Room works</h2>
        <ul className="mt-4 space-y-3 text-sm text-(--text-secondary)">
          {rules.map(([icon, text]) => (
            <li key={icon} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-center text-xl" aria-hidden="true">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        {roleLine && <p className="mt-4 text-center text-sm font-semibold text-(--game-accent)">{roleLine}</p>}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97]"
        >
          Let’s play
        </button>
      </div>
    </div>
  );
}

/** Between Rounds with no team able to play. */
function WaitingScreen({ state }: { state: ReadTheRoomClientState }) {
  const short = state.waitingTeamIds.flatMap(id => {
    const team = findTeam(state, id);
    return team ? [teamShortName(team.name)] : [];
  });
  return (
    <Screen center>
      <div className="flex max-w-sm flex-col items-center animate-fade-in" role="status">
        <p className="text-4xl animate-soft-pulse" aria-hidden="true">⏳</p>
        <h2 className="mt-3 text-lg font-bold text-(--text-primary)">Waiting for players</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          A team needs {RTR_MIN_TEAM_SIZE} players online to take its turn.
          {short.length > 0 && ` ${listNames(short)} ${short.length === 1 ? 'needs' : 'need'} someone back.`}
        </p>
        <p className="mt-1 text-xs text-(--text-muted)">The next round starts on its own.</p>
      </div>
    </Screen>
  );
}

export default function ReadTheRoomGame({ roomHook }: ReadTheRoomGameProps) {
  const { room, playerId, isHost, leaveRoom } = roomHook;
  const game = useReadTheRoom();
  const { state, timer, pending, notice } = game;
  const [showRules, setShowRules] = useState(false);
  const [showQuickRules, setShowQuickRules] = useState(!quickRulesSeen);
  const closeRules = useCallback(() => setShowRules(false), []);
  const closeQuickRules = useCallback(() => {
    quickRulesSeen = true;
    setShowQuickRules(false);
  }, []);

  const revealKey = state?.phase === 'reveal' ? `reveal:${state.roundNumber}` : null;
  const stage = useRevealStage(revealKey, state?.revealElapsedMs ?? 0);

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center" data-game="read-the-room">
        <p className="text-sm text-(--text-secondary) animate-soft-pulse">🧭 Reading the room…</p>
      </div>
    );
  }

  const { phase } = state;
  const myId = playerId;
  const hostName = room ? room.players[room.hostId]?.name ?? 'the host' : 'the host';

  // Don't spoil the reveal: the header shows this round's points once the reveal puts them on screen
  const result = phase === 'reveal' ? state.lastResult : null;
  const holdBack = !!result && stage < REVEAL_STAGE.scores;
  const scores = Object.fromEntries(state.teams.map(t => [t.id, t.score - (holdBack ? result.gains[t.id] ?? 0 : 0)]));

  const header = (
    <header className="flex items-center gap-2 px-4 pb-2 pt-3">
      <span className="text-xl" aria-hidden="true">🧭</span>
      <div className="min-w-0">
        <h1 className="text-sm font-bold leading-tight text-(--text-primary)">Read the Room</h1>
        <p className="truncate text-[11px] text-(--text-muted)">
          {phase === 'finished' ? 'Game over' : phase === 'waiting' ? 'Waiting for players' : `Round ${state.roundNumber}`}
          {' · '}First to {state.settings.targetScore}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowRules(true)}
          aria-label="How to play"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-(--border) bg-(--bg-card) text-sm font-bold text-(--text-secondary) active:scale-95"
        >
          ?
        </button>
        {isHost && phase !== 'finished' && <EndGameButton onConfirm={game.endGame} />}
      </div>
    </header>
  );

  let body;
  if (phase === 'finished') {
    const canRematch = !!room && room.teams.every(
      t => t.playerIds.filter(id => room.players[id]?.connected).length >= RTR_MIN_TEAM_SIZE,
    );
    body = (
      <GameOver
        state={state}
        myId={myId}
        isHost={isHost}
        hostName={hostName}
        canRematch={canRematch}
        onRematch={game.rematch}
        onBackToLobby={game.endGame}
        onLeaveRoom={leaveRoom}
      />
    );
  } else if (phase === 'clue') {
    body = (
      <CluePhase
        key={`${state.roundNumber}:${state.clueGiverId}`}
        state={state}
        myId={myId}
        isHost={isHost}
        timer={timer}
        pending={pending === 'clue'}
        onGiveClue={game.giveClue}
        onSkip={game.skipClueGiver}
      />
    );
  } else if (phase === 'guess') {
    body = (
      <GuessPhase
        key={state.roundNumber}
        state={state}
        myId={myId}
        timer={timer}
        pending={pending === 'lock'}
        onMove={game.moveDial}
        onRelease={game.releaseDial}
        onLockIn={game.lockIn}
      />
    );
  } else if (phase === 'call') {
    body = (
      <CallPhase
        key={state.roundNumber}
        state={state}
        myId={myId}
        timer={timer}
        pending={pending === 'call'}
        onPick={game.pickCall}
        onLock={game.lockCall}
      />
    );
  } else if (phase === 'reveal') {
    body = (
      <RevealPhase
        key={state.roundNumber}
        state={state}
        myId={myId}
        isHost={isHost}
        hostName={hostName}
        stage={stage}
        onNextRound={game.nextRound}
      />
    );
  } else {
    body = <WaitingScreen state={state} />;
  }

  const inRound = phase === 'clue' || phase === 'guess' || phase === 'call';

  return (
    <div data-game="read-the-room" className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col rtr-table">
      {header}
      {phase !== 'finished' && (
        <Scoreboard
          teams={state.teams}
          scores={scores}
          myTeamId={state.myTeamId}
          activeTeamId={phase === 'waiting' ? null : state.activeTeamId}
        />
      )}

      <main className="flex flex-1 flex-col">{body}</main>

      {notice && (
        <div
          key={notice.id}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`fixed left-1/2 top-16 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border bg-(--bg-elevated) px-4 py-2 text-center text-sm text-(--text-primary) shadow-lg animate-slide-up ${
            notice.tone === 'error' ? 'border-(--danger)/40' : 'border-(--border-light)'
          }`}
        >
          {notice.text}
        </div>
      )}

      {showQuickRules && state.roundNumber === 1 && inRound && <QuickRules state={state} onClose={closeQuickRules} />}
      {showRules && <RulesSheet gameId="read-the-room" onClose={closeRules} />}
    </div>
  );
}
