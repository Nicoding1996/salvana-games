'use client';

import { useState } from 'react';

interface Props {
  story: string;
  bluffingTeamMembers: { id: string; name: string; avatar: string }[];
  isOnBluffingTeam: boolean;
  hasVoted: boolean;
  onVote: (suspectId: string) => void;
  teamColor?: string;
}

export default function VotingPhase({ story, bluffingTeamMembers, isOnBluffingTeam, hasVoted, onVote, teamColor }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleVote = () => {
    if (selected) {
      onVote(selected);
    }
  };

  if (isOnBluffingTeam) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="text-4xl mb-4">🎭</div>
        <h2 className="text-lg font-semibold mb-1">Voting in Progress</h2>
        <p className="text-(--text-muted) text-sm text-center">
          They&apos;re deciding who wrote it...
        </p>
      </div>
    );
  }

  if (hasVoted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="text-4xl mb-4">✓</div>
        <h2 className="text-lg font-semibold mb-1">Vote Locked</h2>
        <p className="text-(--text-muted) text-sm text-center">
          Waiting for everyone...
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 animate-slide-up">
      {/* Story reminder */}
      <div
        className="rounded-xl p-3 mb-4 relative overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${teamColor ? teamColor + '20' : 'var(--border)'}`,
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-[1.5px]"
          style={{
            background: teamColor
              ? `linear-gradient(90deg, transparent, ${teamColor}, transparent)`
              : 'none',
            opacity: 0.4,
          }}
        />
        <p className="text-xs text-(--text-muted) mb-1">📜 The story was:</p>
        <p className="text-sm leading-relaxed">&ldquo;{story}&rdquo;</p>
      </div>

      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold mb-0.5">Whose Truth?</h2>
        <p className="text-(--text-muted) text-sm">Tap who you think wrote it</p>
      </div>

      <div className="flex-1 space-y-2">
        {bluffingTeamMembers.map((member) => (
          <button
            key={member.id}
            onClick={() => setSelected(member.id)}
            className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl transition-all active:scale-[0.98] ${
              selected === member.id
                ? 'bg-(--game-accent) text-(--bg-primary)'
                : 'bg-(--bg-card) border border-(--border) hover:border-(--game-accent)/40'
            }`}
            aria-label={`Vote for ${member.name}`}
            aria-pressed={selected === member.id}
          >
            <span className="text-2xl">{member.avatar}</span>
            <span className="text-base font-medium">{member.name}</span>
            {selected === member.id && (
              <span className="ml-auto">✓</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 pb-4">
        <button
          onClick={handleVote}
          disabled={!selected}
          className="w-full py-3.5 bg-(--game-accent) text-(--bg-primary) disabled:opacity-30 rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
        >
          Lock In Vote
        </button>
      </div>
    </div>
  );
}
