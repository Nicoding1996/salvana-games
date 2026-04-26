'use client';

import { useState } from 'react';

interface Props {
  onSubmit: (text: string) => void;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  category: string | null;
  isFirstRound: boolean;
}

export default function WriteStory({ onSubmit, hasSubmitted, submittedCount, totalPlayers, category, isFirstRound }: Props) {
  const [text, setText] = useState('');
  const [showRules, setShowRules] = useState(isFirstRound);

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    }
  };

  if (hasSubmitted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="text-4xl mb-4">✓</div>
        <h2 className="text-lg font-semibold mb-1">Story Submitted</h2>
        <p className="text-(--text-muted) text-sm mb-6">Waiting for others...</p>
        <div className="bg-(--bg-card) border border-(--border) rounded-xl px-5 py-2.5">
          <span className="text-xl font-bold text-(--game-accent)">{submittedCount}</span>
          <span className="text-(--text-muted)"> / {totalPlayers}</span>
        </div>
      </div>
    );
  }

  // Show rules on first round before writing
  if (showRules) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 animate-fade-in">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <span className="text-4xl">📜</span>
            <h2 className="text-xl font-bold mt-3">Whose Truth?</h2>
          </div>

          <div className="space-y-4 text-sm leading-relaxed text-(--text-secondary)">
            <p>
              Everyone writes something true about themselves. Each round, one story gets pulled from a team&apos;s pile.
            </p>
            <p>
              Everyone on that team claims it&apos;s theirs — but only one is telling the truth. The rest are <span className="text-(--game-secondary) font-medium">bluffing</span>.
            </p>
            <p>
              Ask questions out loud to figure out who really wrote it. Then <span className="text-(--game-accent) font-medium">vote</span>.
            </p>
            <p>
              Guess right? Your team scores. Get fooled? The bluffers score.
            </p>
          </div>

          <button
            onClick={() => setShowRules(false)}
            className="w-full mt-8 py-3.5 bg-(--game-accent) text-(--bg-primary) rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
          >
            Got it — write my story
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 animate-slide-up">
      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold mb-1">📜 Write Your Truth</h2>
        {category && (
          <p className="text-(--game-accent) text-sm">{category}</p>
        )}
        <p className="text-(--text-muted) text-xs mt-1">
          Something true about you. Others will try to guess whose it is.
        </p>
      </div>

      <div className="flex-1 flex flex-col">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Once, I actually..."
          className="flex-1 min-h-[140px] p-4 bg-(--bg-card) border border-(--border) rounded-xl text-base outline-none focus:border-(--game-accent) transition-colors placeholder:text-(--text-muted) resize-none"
          autoFocus
          aria-label="Write your true story"
        />
      </div>

      <div className="mt-4 pb-4">
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="w-full py-3.5 bg-(--game-accent) text-(--bg-primary) disabled:opacity-30 rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
        >
          Submit
        </button>
        <p className="text-center text-xs text-(--text-muted) mt-2">
          {submittedCount} / {totalPlayers} submitted
        </p>
      </div>
    </div>
  );
}
