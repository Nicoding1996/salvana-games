'use client';

import type { Team } from '@/types/hub';
import type { StoryThiefClientState } from '@/types/games/story-thief';
import { StoryCard, SuspectRow, teamShortName } from './ui';

export type StoryRole = 'author' | 'bluffer' | 'guesser';

export function roleOf(state: StoryThiefClientState, isOnBluffingTeam: boolean): StoryRole {
  if (state.isMyStory) return 'author';
  return isOnBluffingTeam ? 'bluffer' : 'guesser';
}

const ROLE_COPY: Record<StoryRole, { icon: string; title: string; text: string; tone: string }> = {
  author: {
    icon: '🎯',
    title: 'This is your story',
    text: 'Answer truthfully. The others will try to spot you.',
    tone: 'var(--game-accent)',
  },
  bluffer: {
    icon: '🎭',
    title: 'Claim it’s yours',
    text: 'Everyone on your team says it’s theirs. Make it believable.',
    tone: 'var(--game-secondary)',
  },
  guesser: {
    icon: '🔍',
    title: 'Who really wrote this?',
    text: 'Ask questions out loud, then vote.',
    tone: 'var(--text-primary)',
  },
};

export function RoleCard({ role, className = '' }: { role: StoryRole; className?: string }) {
  const copy = ROLE_COPY[role];
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${className}`}
      style={{
        borderColor: `color-mix(in srgb, ${copy.tone} 30%, transparent)`,
        background: `color-mix(in srgb, ${copy.tone} 8%, var(--bg-card))`,
      }}
    >
      <span className="text-2xl" aria-hidden="true">{copy.icon}</span>
      <div className="min-w-0 text-left">
        <p className="text-sm font-bold" style={{ color: copy.tone }}>{copy.title}</p>
        <p className="text-xs leading-relaxed text-(--text-secondary)">{copy.text}</p>
      </div>
    </div>
  );
}

interface StoryRevealProps {
  state: StoryThiefClientState;
  bluffingTeam: Team | undefined;
  isOnBluffingTeam: boolean;
  playerId: string;
}

/** A story is pulled from the bluffing team's pile (about 3 seconds, then questioning). */
export default function StoryReveal({ state, bluffingTeam, isOnBluffingTeam, playerId }: StoryRevealProps) {
  const role = roleOf(state, isOnBluffingTeam);
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8 pt-2 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--text-muted) animate-fade-in">Round {state.roundNumber}</p>
      <p className="mt-1 text-sm text-(--text-secondary) animate-fade-in">
        A story from{' '}
        <span className="font-semibold" style={{ color: bluffingTeam?.color }}>{bluffingTeam ? teamShortName(bluffingTeam.name) : 'the'}</span>
        &apos;s pile
      </p>

      <div className="mt-5 w-full max-w-sm animate-pull-from-pile">
        <StoryCard story={state.currentStory ?? ''} teamColor={bluffingTeam?.color} size="lg" className="st-story-glow" />
      </div>

      <RoleCard
        role={role}
        className="mt-6 w-full max-w-sm animate-slide-up [animation-delay:450ms] [animation-fill-mode:backwards]"
      />

      <div className="mt-6 w-full animate-fade-in [animation-delay:700ms] [animation-fill-mode:backwards]">
        <p className="mb-2.5 text-[10px] uppercase tracking-[0.18em] text-(--text-muted)">
          One of them wrote it
        </p>
        <SuspectRow members={state.bluffingTeamMembers} teamColor={bluffingTeam?.color} myId={playerId} />
      </div>
    </div>
  );
}
