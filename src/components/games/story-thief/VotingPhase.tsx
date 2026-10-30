'use client';

import { useState } from 'react';
import type { Team } from '@/types/hub';
import type { StoryThiefClientState } from '@/types/games/story-thief';
import { Avatar, PhaseScreen, StoryCard, SuspectRow, VoteProgress, teamStyle } from './ui';

interface VotingPhaseProps {
  state: StoryThiefClientState;
  bluffingTeam: Team | undefined;
  isOnBluffingTeam: boolean;
  playerId: string;
  isHost: boolean;
  sending: boolean;
  onVote: (suspectId: string) => void;
  onForceReveal: () => void;
}

function RevealNow({ state, onForceReveal }: { state: StoryThiefClientState; onForceReveal: () => void }) {
  if (state.votedCount === 0 || state.votedCount >= state.voterCount) return null;
  return (
    <button
      type="button"
      onClick={onForceReveal}
      className="mt-4 h-11 rounded-full border border-(--border-light) px-4 text-xs font-semibold text-(--text-secondary) active:scale-95"
    >
      Reveal now with {state.votedCount} of {state.voterCount} votes
    </button>
  );
}

export default function VotingPhase({
  state, bluffingTeam, isOnBluffingTeam, playerId, isHost, sending, onVote, onForceReveal,
}: VotingPhaseProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const members = state.bluffingTeamMembers;

  // Bluffing team: nothing to do but keep a straight face
  if (isOnBluffingTeam) {
    return (
      <PhaseScreen center>
        <div className="flex w-full max-w-sm flex-col items-center animate-fade-in">
          <p className="text-5xl" aria-hidden="true">🎭</p>
          <h2 className="mt-3 text-lg font-bold text-(--text-primary)">Keep your poker face</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">The others are voting on who really wrote it.</p>
          <div className="mt-6 flex w-full justify-center">
            <VoteProgress voted={state.votedCount} total={state.voterCount} />
          </div>
          <SuspectRow className="mt-7" members={members} teamColor={bluffingTeam?.color} myId={playerId} />
          {isHost && <RevealNow state={state} onForceReveal={onForceReveal} />}
        </div>
      </PhaseScreen>
    );
  }

  // Already voted
  if (state.hasVoted) {
    const pick = members.find(m => m.id === state.myVote);
    return (
      <PhaseScreen center>
        <div className="flex w-full max-w-sm flex-col items-center animate-fade-in">
          {pick && <Avatar emoji={pick.avatar} size={72} teamColor={bluffingTeam?.color} className="st-vote-locked" />}
          <h2 className="mt-4 text-lg font-bold text-(--text-primary)">🔒 You voted for {pick?.name ?? 'your suspect'}</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">Waiting for the other votes…</p>
          <div className="mt-6 flex w-full justify-center">
            <VoteProgress voted={state.votedCount} total={state.voterCount} />
          </div>
          {isHost && <RevealNow state={state} onForceReveal={onForceReveal} />}
        </div>
      </PhaseScreen>
    );
  }

  const selectedMember = members.find(m => m.id === selected);

  return (
    <PhaseScreen
      footer={(
        <button
          type="button"
          onClick={() => selected && onVote(selected)}
          disabled={!selectedMember || sending}
          className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-[transform,opacity] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
        >
          {sending ? 'Locking in…' : selectedMember ? `Lock in ${selectedMember.name}` : 'Tap a suspect'}
        </button>
      )}
    >
      <StoryCard story={state.currentStory ?? ''} teamColor={bluffingTeam?.color} size="sm" label="The story" />

      <div className="mt-5 text-center">
        <h2 className="text-lg font-bold text-(--text-primary)">Who really wrote it?</h2>
        <p className="mt-0.5 text-sm text-(--text-secondary)">Your vote is final.</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Suspects">
        {members.map(m => {
          const active = m.id === selected;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(m.id)}
              className={`st-suspect flex flex-col items-center gap-2 rounded-2xl px-2 py-4 ${active ? 'st-suspect-on' : ''}`}
              style={teamStyle(bluffingTeam?.color)}
            >
              <Avatar emoji={m.avatar} size={56} teamColor={bluffingTeam?.color} dim={!m.connected} />
              <span className="max-w-full truncate text-sm font-semibold text-(--text-primary)">{m.name}</span>
              <span className={`text-[11px] font-semibold ${active ? 'text-(--game-accent)' : 'text-(--text-muted)'}`}>
                {active ? '✓ Your pick' : m.connected ? 'Tap to pick' : 'Offline'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex justify-center">
        <VoteProgress voted={state.votedCount} total={state.voterCount} />
      </div>
      {isHost && (
        <div className="flex justify-center">
          <RevealNow state={state} onForceReveal={onForceReveal} />
        </div>
      )}
    </PhaseScreen>
  );
}
