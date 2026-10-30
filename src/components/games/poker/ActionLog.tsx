'use client';

import { useEffect } from 'react';
import type { ActionHistoryEntry, PokerPhase } from '@/types/games/poker';
import { STREET_NAMES, describeAction } from './format';

interface ActionLogProps {
  actions: ActionHistoryEntry[];
  handNumber: number;
  myId: string | null;
  onClose: () => void;
}

const STREET_ORDER: PokerPhase[] = ['preflop', 'flop', 'turn', 'river'];

/** Bottom sheet with this hand's actions, grouped by street. */
export default function ActionLog({ actions, handNumber, myId, onClose }: ActionLogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const streets = STREET_ORDER
    .map(phase => ({ phase, entries: actions.filter(a => a.phase === phase) }))
    .filter(s => s.entries.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="animate-fade-in absolute inset-0 bg-(--bg-primary)/60" onClick={onClose} aria-hidden="true" />
      <div
        className="animate-poker-sheet relative max-h-[60dvh] w-full max-w-lg overflow-hidden rounded-t-2xl border-t border-(--border-light) bg-(--bg-card)"
        role="dialog"
        aria-label={`Hand ${handNumber} log`}
      >
        <div className="flex items-center justify-between border-b border-(--border) px-4 py-2">
          <h2 className="text-sm font-bold text-(--text-primary)">Hand #{handNumber}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-(--text-muted) active:scale-90"
            aria-label="Close hand log"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[calc(60dvh-52px)] space-y-3 overflow-y-auto px-4 py-3">
          {streets.length === 0 && <p className="text-sm text-(--text-muted)">No actions yet.</p>}
          {streets.map(({ phase, entries }) => (
            <section key={phase}>
              <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-(--text-muted)">
                {STREET_NAMES[phase]}
              </h3>
              <ul className="space-y-0.5">
                {entries.map((entry, i) => (
                  <li
                    key={i}
                    className={`text-[13px] leading-snug ${
                      entry.action === 'fold' ? 'text-(--text-muted)' : entry.action === 'allIn' ? 'text-(--danger)' : 'text-(--text-primary)'
                    }`}
                  >
                    {describeAction(entry, entry.playerId === myId)}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
