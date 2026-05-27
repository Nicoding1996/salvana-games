'use client';

import { useEffect } from 'react';
import { GAME_RULES } from '@/lib/gameRules';

interface RulesSheetProps {
  gameId: string;
  onClose: () => void;
}

/**
 * RulesSheet — slides up from bottom, covers ~75% of screen.
 * Non-intrusive: tap backdrop or X to dismiss.
 * Accessible from lobby "how to play" and in-game "?" button.
 */
export default function RulesSheet({ gameId, onClose }: RulesSheetProps) {
  const rules = GAME_RULES[gameId];

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!rules) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={onClose}
        aria-label="Close rules"
      />

      {/* Sheet */}
      <div className="relative w-full max-w-lg max-h-[78dvh] bg-(--bg-primary) border-t border-(--border) rounded-t-2xl overflow-hidden rules-sheet-enter">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-(--border-light)" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-(--border)">
          <div className="flex items-center gap-2">
            <span className="text-xl">{rules.icon}</span>
            <h2 className="text-base font-bold text-(--text-primary)">{rules.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-(--bg-elevated) text-(--text-muted) hover:text-(--text-primary) transition-colors active:scale-90"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 max-h-[calc(78dvh-80px)]">
          {/* Quick summary */}
          <p className="text-sm text-(--text-secondary) leading-relaxed">{rules.summary}</p>

          {/* Sections */}
          {rules.sections.map((section, i) => (
            <div key={i}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-(--text-muted) mb-1.5">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.items.map((item, j) => (
                  <div key={j} className="flex gap-2 text-sm">
                    <span className="text-(--text-muted) shrink-0 mt-0.5">{item.bullet}</span>
                    <span className="text-(--text-primary) leading-relaxed">{item.text}</span>
                  </div>
                ))}
              </div>
              {section.example && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-(--bg-elevated) border border-(--border)">
                  <p className="text-[11px] text-(--text-muted) mb-0.5">Example:</p>
                  <p className="text-xs text-(--text-secondary) leading-relaxed">{section.example}</p>
                </div>
              )}
            </div>
          ))}

          {/* Tips */}
          {rules.tips && (
            <div className="pt-2 border-t border-(--border)">
              <h3 className="text-xs font-bold uppercase tracking-widest text-(--text-muted) mb-1.5">💡 Tips</h3>
              <div className="space-y-1">
                {rules.tips.map((tip, i) => (
                  <p key={i} className="text-xs text-(--text-secondary) leading-relaxed">• {tip}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
