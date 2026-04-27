'use client';

import type { RoundMode } from '@/types/hub';

interface Props {
  story: string;
  bluffingTeamMembers: { id: string; name: string; avatar: string }[];
  isOnBluffingTeam: boolean;
  isMyStory: boolean;
  hintCard: string | null;
  timerSeconds: number | null;
  roundMode: RoundMode;
  onEndPhase: () => void;
  isHost: boolean;
  teamColor?: string;
}

export default function QuestionPhase({
  story, bluffingTeamMembers, isOnBluffingTeam, isMyStory,
  hintCard, timerSeconds, roundMode,
  onEndPhase, isHost, teamColor,
}: Props) {
  const isUrgent = roundMode === 'timed' && timerSeconds !== null && timerSeconds <= 10;

  return (
    <div className="flex-1 flex flex-col">
      {/* Timer bar */}
      {roundMode === 'timed' && timerSeconds !== null && (
        <div className={`flex items-center justify-center py-3 border-b ${isUrgent ? 'border-(--danger)/30 bg-(--danger-dim)' : 'border-(--border)'}`}>
          <span className={`font-mono text-lg font-bold ${isUrgent ? 'animate-timer-urgent' : 'text-(--text-secondary)'}`}>
            {timerSeconds}s
          </span>
        </div>
      )}
      {roundMode === 'freeFlow' && (
        <div className="flex items-center justify-center py-2.5 border-b border-(--border)">
          <span className="text-xs text-(--text-muted)">🌊 Free Flow</span>
        </div>
      )}

      {/* Story — prominent, centered */}
      <div className="px-5 pt-5 pb-3">
        <div
          className="rounded-xl p-5 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, var(--bg-elevated) 0%, rgba(31, 28, 50, 0.8) 100%)',
            border: `1px solid ${teamColor ? teamColor + '20' : 'rgba(232, 168, 73, 0.12)'}`,
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{
              background: teamColor
                ? `linear-gradient(90deg, transparent, ${teamColor}, transparent)`
                : 'linear-gradient(90deg, transparent, var(--game-accent), transparent)',
              opacity: 0.4,
            }}
          />
          <p className="text-base leading-relaxed text-center">
            &ldquo;{story}&rdquo;
          </p>
        </div>
      </div>

      {/* Role + suspects — centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 gap-5">
        {isMyStory && (
          <div className="bg-(--game-accent-dim) border border-(--game-accent)/25 rounded-xl px-5 py-3 text-center animate-fade-in">
            <p className="text-(--game-accent) font-semibold">🎯 Your story — be truthful</p>
          </div>
        )}

        {isOnBluffingTeam && !isMyStory && (
          <div className="bg-(--game-secondary-dim) border border-(--game-secondary)/25 rounded-xl px-5 py-3 text-center animate-fade-in">
            <p className="text-(--game-secondary) font-semibold">🎭 Bluff — make it yours</p>
            {hintCard && (
              <p className="text-xs text-(--text-muted) mt-1.5 italic">💡 {hintCard}</p>
            )}
          </div>
        )}

        {!isOnBluffingTeam && (
          <div className="text-center animate-fade-in">
            <p className="text-2xl mb-2">🔍</p>
            <p className="font-semibold text-base">Ask questions out loud</p>
            <p className="text-xs text-(--text-muted) mt-1">Who really wrote this?</p>
          </div>
        )}

        {/* Suspects */}
        <div className="flex gap-5 flex-wrap justify-center">
          {bluffingTeamMembers.map((member) => (
            <div key={member.id} className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-full bg-(--bg-card) border border-(--border) flex items-center justify-center text-2xl">
                {member.avatar}
              </div>
              <span className="text-[11px] text-(--text-muted)">{member.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* End questions button */}
      {(isHost || (isOnBluffingTeam && roundMode === 'freeFlow')) && (
        <div className="p-4">
          <button
            onClick={onEndPhase}
            className="w-full py-3.5 bg-(--game-accent) text-(--bg-primary) rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
          >
            End Questions → Vote
          </button>
        </div>
      )}
    </div>
  );
}
