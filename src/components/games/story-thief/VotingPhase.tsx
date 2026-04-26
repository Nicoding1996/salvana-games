'use client';

import { useState } from 'react';

interface Props {
  bluffingTeamMembers: { id: string; name: string; avatar: string }[];
  isOnBluffingTeam: boolean;
  hasVoted: boolean;
  onVote: (suspectId: string) => void;
}

export default function VotingPhase({ bluffingTeamMembers, isOnBluffingTeam, hasVoted, onVote }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleVote = () => {
    if (selected) {
      onVote(selected);
    }
  };

  if (isOnBluffingTeam) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="text-5xl mb-4">🎭</div>
        <h2 className="text-xl font-bold mb-2">Voting in Progress</h2>
        <p className="text-(--text-secondary) text-center">
          The other teams are deciding who they think wrote the story...
        </p>
      </div>
    );
  }

  if (hasVoted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold mb-2">Vote Submitted!</h2>
        <p className="text-(--text-secondary) text-center">
          Waiting for everyone to vote...
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 animate-slide-up">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold mb-1">Who Wrote It?</h2>
        <p className="text-(--text-secondary) text-sm">
          Tap the person you think is the real author
        </p>
      </div>

      <div className="flex-1 space-y-3">
        {bluffingTeamMembers.map((member) => (
          <button
            key={member.id}
            onClick={() => setSelected(member.id)}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98] ${
              selected === member.id
                ? 'bg-(--accent) ring-2 ring-(--accent)'
                : 'bg-(--bg-card) hover:bg-(--bg-secondary)'
            }`}
            aria-label={`Vote for ${member.name}`}
            aria-pressed={selected === member.id}
          >
            <span className="text-3xl">{member.avatar}</span>
            <span className="text-lg font-medium">{member.name}</span>
            {selected === member.id && (
              <span className="ml-auto text-xl">✓</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 pb-4">
        <button
          onClick={handleVote}
          disabled={!selected}
          className="w-full py-4 bg-(--accent) hover:bg-[#d63d56] disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-lg font-semibold transition-all active:scale-95"
        >
          Lock In Vote
        </button>
      </div>
    </div>
  );
}
