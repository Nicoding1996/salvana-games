'use client';

import type { Room, Team } from '@/types/hub';
import type { StoryThiefClientState } from '@/types/games/story-thief';
import { QUESTION_IDEAS } from '@/types/games/story-thief';
import TimerBar from '@/components/shared/TimerBar';
import { roleOf } from './StoryReveal';
import { PhaseScreen, StoryCard, SuspectRow } from './ui';

const URGENT_AT = 10;

interface QuestionPhaseProps {
  state: StoryThiefClientState;
  room: Room;
  bluffingTeam: Team | undefined;
  isOnBluffingTeam: boolean;
  playerId: string;
  isHost: boolean;
  timer: number | null;
  onEndPhase: () => void;
}

/** Three question ideas, a different set each round. */
function questionIdeas(round: number): string[] {
  const start = (round * 3) % QUESTION_IDEAS.length;
  return [0, 1, 2].map(i => QUESTION_IDEAS[(start + i) % QUESTION_IDEAS.length]);
}

export default function QuestionPhase({
  state, room, bluffingTeam, isOnBluffingTeam, playerId, isHost, timer, onEndPhase,
}: QuestionPhaseProps) {
  const role = roleOf(state, isOnBluffingTeam);
  const timed = room.settings.roundMode === 'timed';
  const canEnd = isHost || (!timed && !isOnBluffingTeam);
  const urgent = timed && timer !== null && timer <= URGENT_AT;

  let footer;
  if (canEnd) {
    footer = (
      <button
        type="button"
        onClick={onEndPhase}
        className={`h-14 w-full rounded-2xl font-heading text-base font-semibold transition-transform active:scale-[0.97] ${
          isOnBluffingTeam
            ? 'border border-(--border-light) bg-(--bg-card) text-(--text-secondary)'
            : 'bg-(--game-accent) text-(--bg-primary)'
        }`}
      >
        {timed ? 'End questions early · vote now' : 'We’re ready · start the vote'}
      </button>
    );
  } else {
    footer = (
      <p className="flex min-h-14 items-center justify-center rounded-2xl border border-dashed border-(--border-light) px-4 text-center text-sm text-(--text-secondary)">
        {timed ? 'Voting starts when the timer runs out' : 'The guessers start the vote when they’re ready'}
      </p>
    );
  }

  return (
    <PhaseScreen footer={footer}>
      {/* Clock */}
      {timed ? (
        <div className={`mb-3 rounded-2xl border px-4 py-2.5 ${urgent ? 'border-(--danger)/40 bg-(--danger-dim)' : 'border-(--border) bg-(--bg-card)'}`}>
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-(--text-muted)">Question time</p>
            <p
              className={`font-mono text-2xl font-bold tabular-nums ${urgent ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-primary)'}`}
              aria-live="off"
            >
              {timer ?? room.settings.timerSeconds}s
            </p>
          </div>
          <div className="mt-2">
            <TimerBar seconds={timer ?? room.settings.timerSeconds} total={room.settings.timerSeconds} urgentAt={URGENT_AT} />
          </div>
        </div>
      ) : (
        <p className="mb-3 text-center text-xs text-(--text-muted)">🌊 Free flow · take as long as you like</p>
      )}

      <StoryCard story={state.currentStory ?? ''} teamColor={bluffingTeam?.color} size="md" />

      {/* Who claims it: right under the story so it stays on screen */}
      <div className="mt-4">
        <p className="mb-2.5 text-center text-[10px] uppercase tracking-[0.18em] text-(--text-muted)">Suspects</p>
        <SuspectRow members={state.bluffingTeamMembers} teamColor={bluffingTeam?.color} myId={playerId} />
      </div>

      {/* What to do right now */}
      <section className="mt-4 rounded-2xl border border-(--border) bg-(--bg-card) p-4" aria-label="Your role">
        {role === 'guesser' && (
          <>
            <p className="text-sm font-bold text-(--text-primary)">🔍 Ask them out loud</p>
            <p className="mt-0.5 text-xs text-(--text-secondary)">Everyone on the other team claims it. Watch who hesitates.</p>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Question ideas">
              {questionIdeas(state.roundNumber).map(q => (
                <li key={q} className="rounded-full border border-(--border-light) bg-(--bg-elevated) px-3 py-1.5 text-xs text-(--text-primary)">
                  “{q}”
                </li>
              ))}
            </ul>
          </>
        )}
        {role === 'bluffer' && (
          <>
            <p className="text-sm font-bold text-(--game-secondary)">🎭 You’re bluffing</p>
            <p className="mt-0.5 text-xs text-(--text-secondary)">Say it’s yours. Answer quickly and confidently.</p>
            {state.hintCard && (
              <p className="mt-3 rounded-xl bg-(--game-secondary-dim) px-3 py-2 text-xs leading-relaxed text-(--text-primary)">
                💡 {state.hintCard}
              </p>
            )}
          </>
        )}
        {role === 'author' && (
          <>
            <p className="text-sm font-bold text-(--game-accent)">🎯 Your story · tell the truth</p>
            <p className="mt-0.5 text-xs leading-relaxed text-(--text-secondary)">
              Don’t over-explain. Real memories are a little fuzzy, and the bluffers will be the ones adding details.
            </p>
          </>
        )}
      </section>
    </PhaseScreen>
  );
}
