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
}

export default function QuestionPhase({
  story, bluffingTeamMembers, isOnBluffingTeam, isMyStory,
  hintCard, timerSeconds, roundMode,
  onEndPhase, isHost,
}: Props) {
  return (
    <div className="flex-1 flex flex-col">
      {/* Timer bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-(--bg-card)">
        <div className="text-sm">
          {roundMode === 'timed' && timerSeconds !== null && (
            <span className={timerSeconds <= 10 ? 'text-(--accent) font-bold text-lg' : 'text-(--text-secondary)'}>
              ⏱ {timerSeconds}s
            </span>
          )}
          {roundMode === 'freeFlow' && (
            <span className="text-(--text-secondary)">🌊 Free Flow — ask away!</span>
          )}
        </div>
      </div>

      {/* Story card */}
      <div className="mx-4 mt-4 bg-(--bg-secondary) rounded-2xl p-4 border border-(--accent-secondary)/20">
        <p className="text-xs text-(--text-secondary) mb-1">📖 The Story</p>
        <p className="text-base leading-relaxed">&ldquo;{story}&rdquo;</p>
      </div>

      {/* Role indicator + hint */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        {isMyStory && (
          <div className="bg-(--accent)/20 border border-(--accent) rounded-2xl px-5 py-3 text-center animate-fade-in">
            <p className="text-(--accent) font-semibold text-lg">🎯 This is YOUR story</p>
            <p className="text-sm text-(--text-secondary) mt-1">Answer questions truthfully</p>
          </div>
        )}

        {isOnBluffingTeam && !isMyStory && (
          <div className="bg-(--accent-secondary)/20 border border-(--accent-secondary) rounded-2xl px-5 py-3 text-center animate-fade-in">
            <p className="font-semibold text-lg">🎭 Bluff!</p>
            <p className="text-sm text-(--text-secondary) mt-1">Claim this story is yours</p>
            {hintCard && (
              <p className="text-xs text-(--accent-secondary) mt-3 italic">💡 {hintCard}</p>
            )}
          </div>
        )}

        {!isOnBluffingTeam && (
          <div className="text-center animate-fade-in">
            <p className="text-5xl mb-3">🔍</p>
            <p className="font-semibold text-lg">Ask questions out loud!</p>
            <p className="text-sm text-(--text-secondary) mt-1">
              Figure out who really wrote this story
            </p>
          </div>
        )}

        {/* Suspects display */}
        <div className="flex gap-4 flex-wrap justify-center mt-4">
          {bluffingTeamMembers.map((member) => (
            <div key={member.id} className="flex flex-col items-center gap-1">
              <span className="text-3xl">{member.avatar}</span>
              <span className="text-xs text-(--text-secondary)">{member.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* End questions button */}
      {(isHost || (isOnBluffingTeam && roundMode === 'freeFlow')) && (
        <div className="p-4">
          <button
            onClick={onEndPhase}
            className="w-full py-4 bg-(--accent) hover:bg-[#d63d56] rounded-2xl text-lg font-semibold transition-all active:scale-95"
          >
            End Questions → Vote
          </button>
        </div>
      )}
    </div>
  );
}
