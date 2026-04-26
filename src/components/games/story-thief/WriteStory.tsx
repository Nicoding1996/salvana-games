'use client';

import { useState } from 'react';

interface Props {
  onSubmit: (text: string) => void;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
  category: string | null;
}

export default function WriteStory({ onSubmit, hasSubmitted, submittedCount, totalPlayers, category }: Props) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    }
  };

  if (hasSubmitted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold mb-2">Story Submitted!</h2>
        <p className="text-(--text-secondary) text-center mb-6">
          Waiting for others...
        </p>
        <div className="bg-(--bg-card) rounded-2xl px-6 py-3">
          <span className="text-2xl font-bold">{submittedCount}</span>
          <span className="text-(--text-secondary)"> / {totalPlayers}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 animate-slide-up">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold mb-1">Write Your Truth</h2>
        {category && (
          <p className="text-(--accent) text-sm">
            💡 Suggestion: {category}
          </p>
        )}
        <p className="text-(--text-secondary) text-xs mt-1">
          Write something true about yourself. Others will try to guess whose story it is!
        </p>
      </div>

      <div className="flex-1 flex flex-col">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Once upon a time, I actually..."
          className="flex-1 min-h-[150px] p-4 bg-(--bg-card) rounded-2xl text-base outline-none focus:ring-2 focus:ring-(--accent) placeholder:text-(--text-secondary) resize-none"
          autoFocus
          aria-label="Write your true story"
        />
      </div>

      <div className="mt-4 pb-4">
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="w-full py-4 bg-(--accent) hover:bg-[#d63d56] disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-lg font-semibold transition-all active:scale-95"
        >
          Submit Story
        </button>
        <p className="text-center text-xs text-(--text-secondary) mt-2">
          {submittedCount} / {totalPlayers} submitted
        </p>
      </div>
    </div>
  );
}
