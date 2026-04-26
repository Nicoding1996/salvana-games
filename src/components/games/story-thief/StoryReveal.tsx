'use client';

interface Props {
  story: string;
  bluffingTeamMembers: { id: string; name: string; avatar: string }[];
  isOnBluffingTeam: boolean;
  isMyStory: boolean;
}

export default function StoryReveal({ story, bluffingTeamMembers, isOnBluffingTeam, isMyStory }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">
      {/* The story card — dramatic pull from pile */}
      <div className="w-full max-w-sm animate-pull-from-pile">
        <div className="story-card rounded-2xl p-7 animate-glow-pulse">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-xl">📜</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-(--game-accent) font-medium">Whose Truth?</span>
          </div>
          <p className="text-lg leading-relaxed text-center font-medium">
            &ldquo;{story}&rdquo;
          </p>
        </div>
      </div>

      {/* Role badge — appears after card */}
      <div className="mt-8 animate-slide-up" style={{ animationDelay: '0.4s', animationFillMode: 'backwards' }}>
        {isMyStory && (
          <div className="bg-(--game-accent-dim) border border-(--game-accent)/30 rounded-full px-5 py-2.5 flex items-center gap-2">
            <span>🎯</span>
            <div>
              <p className="text-(--game-accent) font-semibold text-sm">Your story</p>
              <p className="text-[11px] text-(--text-muted)">Answer truthfully</p>
            </div>
          </div>
        )}
        {isOnBluffingTeam && !isMyStory && (
          <div className="bg-(--game-secondary-dim) border border-(--game-secondary)/30 rounded-full px-5 py-2.5 flex items-center gap-2">
            <span>🎭</span>
            <div>
              <p className="text-(--game-secondary) font-semibold text-sm">Claim it&apos;s yours</p>
              <p className="text-[11px] text-(--text-muted)">Read it. Own it. Bluff it.</p>
            </div>
          </div>
        )}
        {!isOnBluffingTeam && (
          <div className="bg-(--bg-card) border border-(--border) rounded-full px-5 py-2.5 flex items-center gap-2">
            <span>🔍</span>
            <div>
              <p className="font-semibold text-sm">Who wrote this?</p>
              <p className="text-[11px] text-(--text-muted)">Get ready to investigate</p>
            </div>
          </div>
        )}
      </div>

      {/* Suspects row */}
      <div className="mt-6 flex gap-5 flex-wrap justify-center animate-fade-in" style={{ animationDelay: '0.6s', animationFillMode: 'backwards' }}>
        {bluffingTeamMembers.map((member) => (
          <div key={member.id} className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-(--bg-card) border border-(--border) flex items-center justify-center text-2xl">
              {member.avatar}
            </div>
            <span className="text-[11px] text-(--text-muted)">{member.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
