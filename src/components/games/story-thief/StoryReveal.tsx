'use client';

interface Props {
  story: string;
  bluffingTeamMembers: { id: string; name: string; avatar: string }[];
  isOnBluffingTeam: boolean;
  isMyStory: boolean;
}

export default function StoryReveal({ story, bluffingTeamMembers, isOnBluffingTeam, isMyStory }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      {/* Story Card */}
      <div className="bg-(--bg-card) rounded-3xl p-6 w-full max-w-sm animate-card-flip shadow-lg border border-(--accent-secondary)/30">
        <div className="text-center mb-4">
          <span className="text-3xl">📖</span>
        </div>
        <p className="text-lg leading-relaxed text-center">
          &ldquo;{story}&rdquo;
        </p>
      </div>

      {/* Role indicator */}
      <div className="mt-6 text-center animate-fade-in">
        {isMyStory && (
          <div className="bg-(--accent)/20 border border-(--accent) rounded-2xl px-4 py-2">
            <p className="text-(--accent) font-semibold">🎯 This is YOUR story!</p>
            <p className="text-xs text-(--text-secondary) mt-1">Answer truthfully when questioned</p>
          </div>
        )}
        {isOnBluffingTeam && !isMyStory && (
          <div className="bg-(--accent-secondary)/20 border border-(--accent-secondary) rounded-2xl px-4 py-2">
            <p className="text-(--accent-secondary) font-semibold">🎭 Claim this is yours!</p>
            <p className="text-xs text-(--text-secondary) mt-1">Bluff convincingly when questioned</p>
          </div>
        )}
        {!isOnBluffingTeam && (
          <div className="bg-(--bg-card) rounded-2xl px-4 py-2">
            <p className="font-semibold">🔍 Who wrote this?</p>
            <p className="text-xs text-(--text-secondary) mt-1">Get ready to ask questions!</p>
          </div>
        )}
      </div>

      {/* Suspects */}
      <div className="mt-4 flex gap-3 flex-wrap justify-center">
        {bluffingTeamMembers.map((member) => (
          <div key={member.id} className="flex flex-col items-center animate-slide-up">
            <span className="text-2xl">{member.avatar}</span>
            <span className="text-xs text-(--text-secondary)">{member.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
