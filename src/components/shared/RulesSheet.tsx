'use client';

import { useEffect, useRef } from 'react';
import { GAME_RULES } from '@/lib/gameRules';

interface RulesSheetProps {
  gameId: string;
  onClose: () => void;
}

/**
 * RulesSheet — slides up from bottom, covers ~75% of screen.
 * Non-intrusive: tap backdrop or X to dismiss.
 * Accessible from the home page game list, lobby "How to play" and in-game "?" button.
 */
export default function RulesSheet({ gameId, onClose }: RulesSheetProps) {
  const rules = GAME_RULES[gameId];
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Move focus into the sheet while open, and give it back to the opener on close
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);

  if (!rules) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop — the close button is the accessible way out */}
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden="true" />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-sheet-title"
        className="relative w-full max-w-lg max-h-[78dvh] flex flex-col bg-(--bg-card) border-t border-(--border-light) rounded-t-3xl shadow-2xl rules-sheet-enter"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-(--border-light)" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 pl-5 pr-3 pb-2 border-b border-(--border)">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl" aria-hidden="true">{rules.icon}</span>
            <h2 id="rules-sheet-title" className="text-lg font-bold text-(--text-primary) truncate">{rules.name}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-elevated) transition-colors active:scale-90"
            aria-label="Close rules"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] space-y-5">
          {/* Quick summary */}
          <p className="text-sm text-(--text-secondary) leading-relaxed">{rules.summary}</p>

          {/* Sections */}
          {rules.sections.map((section, i) => (
            <div key={i}>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-(--text-muted) mb-2">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.items.map((item, j) => (
                  <div key={j} className="flex gap-2.5 text-sm">
                    <span className="text-(--text-muted) shrink-0 w-5 text-center" aria-hidden="true">{item.bullet}</span>
                    <span className="text-(--text-primary) leading-relaxed">{item.text}</span>
                  </div>
                ))}
              </div>
              {section.example && (
                <div className="mt-2.5 px-3.5 py-2.5 rounded-xl bg-(--bg-elevated) border border-(--border)">
                  <p className="text-xs font-semibold text-(--text-muted) mb-0.5">Example</p>
                  <p className="text-[13px] text-(--text-secondary) leading-relaxed">{section.example}</p>
                </div>
              )}
            </div>
          ))}

          {/* Tips */}
          {rules.tips && (
            <div className="pt-4 border-t border-(--border)">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-(--text-muted) mb-2">💡 Tips</h3>
              <ul className="space-y-1.5">
                {rules.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-(--text-secondary) leading-relaxed">
                    <span aria-hidden="true">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
