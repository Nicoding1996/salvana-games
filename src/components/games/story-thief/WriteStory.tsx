'use client';

import { useState } from 'react';
import type { Room } from '@/types/hub';
import type { StoryThiefClientState } from '@/types/games/story-thief';
import { MAX_STORY_LENGTH, STORY_CATEGORIES } from '@/types/games/story-thief';
import { Avatar, PhaseScreen } from './ui';

// The how-it-works intro is shown once per page load.
let introSeen = false;

// ---- Composer: prompt idea, text box, counter, submit ----

interface StoryComposerProps {
  prompt: string | null;
  sending: boolean;
  onSubmit: (text: string) => void;
  submitLabel?: string;
  autoFocus?: boolean;
}

export function StoryComposer({ prompt, sending, onSubmit, submitLabel = 'Add to the pile', autoFocus = false }: StoryComposerProps) {
  const [text, setText] = useState('');
  const [promptIndex, setPromptIndex] = useState(() => {
    const i = prompt ? STORY_CATEGORIES.indexOf(prompt) : -1;
    return i >= 0 ? i : 0;
  });
  const trimmed = text.trim();
  const nearLimit = text.length > MAX_STORY_LENGTH - 60;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-(--border) bg-(--bg-card) py-1 pl-3 pr-1">
        <span className="text-sm" aria-hidden="true">💡</span>
        <p className="min-w-0 flex-1 text-sm text-(--text-secondary)">
          Idea: <span key={promptIndex} className="font-semibold text-(--game-accent) animate-fade-in">{STORY_CATEGORIES[promptIndex]}</span>
        </p>
        <button
          type="button"
          onClick={() => setPromptIndex(i => (i + 1) % STORY_CATEGORIES.length)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base text-(--text-secondary) active:scale-90"
          aria-label="Show another idea"
        >
          🔀
        </button>
      </div>

      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_STORY_LENGTH}
          rows={5}
          placeholder="Once, I actually…"
          autoFocus={autoFocus}
          className="st-textarea block min-h-[150px] w-full resize-none rounded-2xl px-4 py-3.5 text-base leading-7 text-(--text-primary) outline-none transition-colors placeholder:text-(--text-muted)"
          aria-label="Write something true about yourself"
        />
        <span
          className={`pointer-events-none absolute bottom-2.5 right-3 text-[11px] tabular-nums ${nearLimit ? 'text-(--danger)' : 'text-(--text-muted)'}`}
          aria-hidden="true"
        >
          {text.length}/{MAX_STORY_LENGTH}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-(--text-muted)">
        Keep it <span className="text-(--text-secondary)">true</span> and a little surprising. Your teammates will have to pretend it happened to them.
      </p>

      <button
        type="button"
        onClick={() => trimmed && onSubmit(trimmed)}
        disabled={!trimmed || sending}
        className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-[transform,opacity] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
      >
        {sending ? 'Sending…' : submitLabel}
      </button>
    </div>
  );
}

// ---- First-round intro ----

const INTRO_STEPS = [
  { icon: '✍️', title: 'Write a true story', text: 'Something real about you. Nobody sees who wrote what.' },
  { icon: '🎭', title: 'Your team claims it', text: 'When a story from your pile comes up, everyone on your team says "that\'s mine!"' },
  { icon: '🔍', title: 'The others investigate', text: 'They ask questions out loud, then vote on the real author.' },
  { icon: '🏆', title: 'Score', text: 'Guessers right → they get 5. Fooled → the bluffers get 5.' },
];

function Intro({ onDone }: { onDone: () => void }) {
  return (
    <PhaseScreen
      footer={(
        <button
          type="button"
          onClick={onDone}
          className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97]"
        >
          Got it, write my story
        </button>
      )}
    >
      <div className="pt-4 text-center">
        <p className="text-4xl" aria-hidden="true">📜</p>
        <h2 className="mt-2 text-xl font-bold text-(--text-primary)">How Whose Truth? works</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">One real story. A whole team claiming it.</p>
      </div>
      <ol className="mt-6 space-y-2.5">
        {INTRO_STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex items-start gap-3 rounded-2xl border border-(--border) bg-(--bg-card) p-3.5 animate-slide-up"
            style={{ animationDelay: `${i * 90}ms`, animationFillMode: 'backwards' }}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--game-accent-dim) text-xl" aria-hidden="true">
              {step.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-(--text-primary)">{step.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-(--text-secondary)">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-center text-xs text-(--text-muted)">Questions happen out loud. Your phone shows the story, your role and the vote.</p>
    </PhaseScreen>
  );
}

// ---- Setup phase ----

interface WriteStoryProps {
  state: StoryThiefClientState;
  room: Room;
  playerId: string;
  sending: boolean;
  onSubmit: (text: string) => void;
}

export default function WriteStory({ state, room, playerId, sending, onSubmit }: WriteStoryProps) {
  const [showIntro, setShowIntro] = useState(() => !introSeen);

  const players = Object.values(room.players).filter(p => p.connected || state.submittedPlayers.includes(p.id));
  const done = players.filter(p => state.submittedPlayers.includes(p.id)).length;

  if (state.hasSubmittedStory) {
    const pct = players.length > 0 ? Math.round((done / players.length) * 100) : 0;
    return (
      <PhaseScreen center>
        <div className="flex w-full max-w-sm flex-col items-center animate-fade-in">
          <div className="st-check flex h-16 w-16 items-center justify-center rounded-full text-3xl" aria-hidden="true">✓</div>
          <h2 className="mt-4 text-lg font-bold text-(--text-primary)">Your story is in the pile</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">The first round starts when everyone&apos;s done.</p>

          <div className="mt-6 w-full max-w-xs">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-(--text-muted)">Stories written</span>
              <span className="font-semibold tabular-nums text-(--text-primary)">{done} / {players.length}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-(--bg-elevated)">
              <div className="h-full rounded-full bg-(--game-accent) transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <ul className="mt-6 grid w-full grid-cols-3 gap-2" aria-label="Who is still writing">
            {players.map(p => {
              const wrote = state.submittedPlayers.includes(p.id);
              return (
                <li
                  key={p.id}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 ${
                    wrote ? 'border-(--success)/25 bg-(--success-dim)' : 'border-(--border) bg-(--bg-card)'
                  }`}
                >
                  <Avatar emoji={p.avatar} size={34} dim={!p.connected} />
                  <span className="max-w-full truncate text-[11px] text-(--text-secondary)">{p.id === playerId ? 'You' : p.name}</span>
                  <span className={`text-[10px] font-semibold ${wrote ? 'text-(--success)' : 'text-(--text-muted) animate-soft-pulse'}`}>
                    {wrote ? '✓ Done' : p.connected ? '✍️ Writing' : 'Offline'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </PhaseScreen>
    );
  }

  if (showIntro) {
    return <Intro onDone={() => { introSeen = true; setShowIntro(false); }} />;
  }

  return (
    <PhaseScreen>
      <div className="pt-2 animate-slide-up">
        <h2 className="text-lg font-bold text-(--text-primary)">Write something true about you</h2>
        <p className="mt-0.5 text-sm text-(--text-secondary)">
          {done} of {players.length} {players.length === 1 ? 'story' : 'stories'} written
        </p>
        <div className="mt-4">
          <StoryComposer prompt={state.storyCategory} sending={sending} onSubmit={onSubmit} autoFocus />
        </div>
      </div>
    </PhaseScreen>
  );
}
