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
        <div className="text-4xl mb-4">⏳</div>
        <h2 className="text-lg font-semibold mb-1">Waiting</h2>
        <p className="text-(--text-muted) text-sm text-center">
          The author is writing their next story
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
        <h2 className="text-lg font-semibold mb-1">✍️ New Story</h2>
        {category && <p className="text-(--game-accent) text-sm">{category}</p>}
        <p className="text-(--text-muted) text-xs mt-1">Your story was used — write a new one</p>
      </div>

      <div className="flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Another true story..."
          className="w-full h-full min-h-[140px] p-4 bg-(--bg-card) border border-(--border) rounded-xl text-base outline-none focus:border-(--game-accent) transition-colors resize-none placeholder:text-(--text-muted)"
          autoFocus
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
      </div>
    </div>
  );
}
