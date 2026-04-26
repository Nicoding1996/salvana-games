'use client';

import { useState } from 'react';

interface Props {
  needsReplacement: boolean;
  onSubmit: (text: string) => void;
  category: string | null;
}

export default function ReplacementPhase({ needsReplacement, onSubmit, category }: Props) {
  const [text, setText] = useState('');

  if (!needsReplacement) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="text-5xl mb-4">⏳</div>
        <h2 className="text-xl font-bold mb-2">Waiting...</h2>
        <p className="text-(--text-secondary) text-center">
          The author is writing their replacement story
        </p>
      </div>
    );
  }

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 animate-slide-up">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold mb-1">Write a New Story</h2>
        {category && (
          <p className="text-(--accent) text-sm">💡 Suggestion: {category}</p>
        )}
        <p className="text-(--text-secondary) text-xs mt-1">
          Your story was used! Write a new one to refill the pile.
        </p>
      </div>

      <div className="flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write another true story..."
          className="w-full h-full min-h-[150px] p-4 bg-(--bg-card) rounded-2xl text-base outline-none focus:ring-2 focus:ring-(--accent) resize-none"
          autoFocus
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
      </div>
    </div>
  );
}
