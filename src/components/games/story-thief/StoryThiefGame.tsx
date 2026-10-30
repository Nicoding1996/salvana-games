'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Room } from '@/types/hub';
import type { StoryThiefClientState } from '@/types/games/story-thief';
import { useStoryThief } from '@/lib/games/story-thief/useStoryThief';
import RulesSheet from '@/components/shared/RulesSheet';
import EndGameButton from '@/components/shared/EndGameButton';
import WriteStory, { StoryComposer } from './WriteStory';
import StoryReveal from './StoryReveal';
import QuestionPhase from './QuestionPhase';
import VotingPhase from './VotingPhase';
import ResultPhase from './ResultPhase';
import GameSummary from './GameSummary';
import { PhaseScreen, Scoreboard, listNames } from './ui';

interface Props {
  room: Room;
  playerId: string;
  isHost: boolean;
  onLeaveRoom: () => void;
}

// ---- Between rounds: the next round waits for a story (or for players) ----

function WaitingForStory({ state, room, playerId, sending, onSubmit }: {
  state: StoryThiefClientState;
  room: Room;
  playerId: string;
  sending: boolean;
  onSubmit: (text: string) => void;
}) {
  if (state.needsReplacement && room.players[playerId]?.teamId === state.bluffingTeamId) {
    return (
      <PhaseScreen>
        <div className="pt-2 animate-slide-up">
          <h2 className="text-lg font-bold text-(--text-primary)">✍️ Your team is up next</h2>
          <p className="mt-0.5 text-sm text-(--text-secondary)">
            Write a new true story to start the round. Everyone on the bluffing team needs one in the pile, so nobody can be ruled out.
          </p>
          <div className="mt-4">
            <StoryComposer prompt={state.storyCategory} sending={sending} onSubmit={onSubmit} submitLabel="Add it & start the round" />
          </div>
        </div>
      </PhaseScreen>
    );
  }

  const names = state.waitingOn.map(id => (id === playerId ? 'you' : room.players[id]?.name)).filter(Boolean) as string[];
  return (
    <PhaseScreen center>
      <div className="flex max-w-sm flex-col items-center animate-fade-in">
        <p className="text-4xl animate-soft-pulse" aria-hidden="true">⏳</p>
        <h2 className="mt-3 text-lg font-bold text-(--text-primary)">
          {names.length > 0 ? `Waiting for ${listNames(names)}` : 'Waiting for players'}
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {names.length > 0
            ? `${names.length === 1 ? 'They’re' : 'They’re each'} writing a new story for the next round.`
            : 'The next round starts when enough players are back online.'}
        </p>
      </div>
    </PhaseScreen>
  );
}

// ---- Bottom sheet for a story you owe while a round is going on ----

function OwedStorySheet({ prompt, sending, onSubmit, onClose }: {
  prompt: string | null;
  sending: boolean;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="st-owed-title"
        className="relative w-full max-w-lg rounded-t-3xl border-t border-(--border-light) bg-(--bg-card) px-4 pt-3 st-safe-bottom st-sheet-up"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-(--border-light)" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="st-owed-title" className="text-base font-bold text-(--text-primary)">✍️ Your next true story</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-(--text-muted) active:scale-90"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <StoryComposer prompt={prompt} sending={sending} onSubmit={onSubmit} autoFocus />
      </div>
    </div>
  );
}

export default function StoryThiefGame({ room, playerId, isHost, onLeaveRoom }: Props) {
  const game = useStoryThief();
  const { state, timer, sending, notice } = game;
  const [showRules, setShowRules] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [verdictRound, setVerdictRound] = useState(0);
  const closeRules = useCallback(() => setShowRules(false), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const markVerdict = useCallback((round: number) => setVerdictRound(round), []);

  // Close the sheet once the server has the story (adjusting state while rendering)
  const owes = state?.needsReplacement ?? false;
  const [prevOwes, setPrevOwes] = useState(owes);
  if (owes !== prevOwes) {
    setPrevOwes(owes);
    if (!owes) setSheetOpen(false);
  }

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center" data-game="story-thief">
        <p className="text-sm text-(--text-secondary) animate-soft-pulse">📜 Shuffling the stories…</p>
      </div>
    );
  }

  const { phase } = state;
  const myTeamId = room.players[playerId]?.teamId ?? null;
  const isOnBluffingTeam = !!myTeamId && myTeamId === state.bluffingTeamId;
  const bluffingTeam = room.teams.find(t => t.id === state.bluffingTeamId);
  const waiting = state.waitingForReplacement;
  const inRound = phase === 'reveal' || phase === 'questioning' || phase === 'voting' || (phase === 'result' && !waiting);
  // A bluffer the next round is waiting on gets the composer inline instead
  const showOwedPill = state.needsReplacement && (inRound || (waiting && !isOnBluffingTeam));

  // Don't spoil the reveal: the header shows this round's points once the verdict is on screen
  const result = phase === 'result' && !waiting ? state.lastVoteResult : null;
  const headerScores = result && verdictRound !== state.roundNumber
    ? Object.fromEntries(room.teams.map(t => [t.id, (state.teamScores[t.id] ?? 0) - (result.teamPointsAwarded[t.id] ?? 0)]))
    : state.teamScores;

  let body;
  if (phase === 'setup') {
    body = <WriteStory state={state} room={room} playerId={playerId} sending={sending === 'story'} onSubmit={game.submitStory} />;
  } else if (phase === 'reveal') {
    body = <StoryReveal state={state} bluffingTeam={bluffingTeam} isOnBluffingTeam={isOnBluffingTeam} playerId={playerId} />;
  } else if (phase === 'questioning') {
    body = (
      <QuestionPhase
        state={state}
        room={room}
        bluffingTeam={bluffingTeam}
        isOnBluffingTeam={isOnBluffingTeam}
        playerId={playerId}
        isHost={isHost}
        timer={timer}
        onEndPhase={game.endQuestionPhase}
      />
    );
  } else if (phase === 'voting') {
    body = (
      <VotingPhase
        key={state.roundNumber}
        state={state}
        bluffingTeam={bluffingTeam}
        isOnBluffingTeam={isOnBluffingTeam}
        playerId={playerId}
        isHost={isHost}
        sending={sending === 'vote'}
        onVote={game.submitVote}
        onForceReveal={game.forceReveal}
      />
    );
  } else if (phase === 'result' && waiting) {
    body = <WaitingForStory state={state} room={room} playerId={playerId} sending={sending === 'story'} onSubmit={game.submitStory} />;
  } else if (phase === 'result') {
    body = (
      <ResultPhase
        key={state.roundNumber}
        state={state}
        room={room}
        playerId={playerId}
        isHost={isHost}
        onNextRound={game.nextRound}
        onVerdict={markVerdict}
      />
    );
  } else {
    body = (
      <GameSummary
        state={state}
        room={room}
        playerId={playerId}
        isHost={isHost}
        onBackToLobby={game.endGame}
        onLeaveRoom={onLeaveRoom}
      />
    );
  }

  return (
    <div data-game="story-thief" className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="flex items-center gap-2 px-4 pb-2 pt-3">
        <span className="text-xl" aria-hidden="true">📜</span>
        <div className="min-w-0">
          <h1 className="text-sm font-bold leading-tight text-(--text-primary)">Whose Truth?</h1>
          <p className="truncate text-[11px] text-(--text-muted)">
            {phase === 'setup' ? 'Writing stories' : phase === 'finished' ? 'Game over' : `Round ${state.roundNumber}`}
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

      {phase !== 'setup' && (
        <Scoreboard
          teams={room.teams}
          scores={headerScores}
          myTeamId={myTeamId}
          bluffingTeamId={inRound ? state.bluffingTeamId : null}
        />
      )}

      {showOwedPill && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mx-4 mb-2 flex min-h-11 items-center gap-2 rounded-xl border border-(--game-accent)/35 bg-(--game-accent-dim) px-3 py-2 text-left animate-slide-up"
        >
          <span aria-hidden="true">✍️</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-(--game-accent)">Write your next story</span>
            <span className="block text-[11px] text-(--text-muted)">Needed before your team bluffs again</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-(--game-accent)">Write ›</span>
        </button>
      )}

      <main className="flex flex-1 flex-col">{body}</main>

      {notice && (
        <div
          key={notice.id}
          role="alert"
          className="fixed left-1/2 top-14 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-(--danger)/40 bg-(--bg-elevated) px-4 py-2 text-center text-sm text-(--text-primary) shadow-lg animate-slide-up"
        >
          {notice.text}
        </div>
      )}

      {sheetOpen && showOwedPill && (
        <OwedStorySheet prompt={state.storyCategory} sending={sending === 'story'} onSubmit={game.submitStory} onClose={closeSheet} />
      )}
      {showRules && <RulesSheet gameId="story-thief" onClose={closeRules} />}
    </div>
  );
}
