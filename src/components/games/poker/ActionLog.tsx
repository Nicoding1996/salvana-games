'use client';

import { useRef, useEffect } from 'react';
import type { ActionHistoryEntry } from '@/types/games/poker';

interface ActionLogProps {
  actions: ActionHistoryEntry[];
}

function formatAction(entry: ActionHistoryEntry): string {
  switch (entry.action) {
    case 'fold': return `${entry.playerName} folded`;
    case 'check': return `${entry.playerName} checked`;
    case 'call': return `${entry.playerName} called ${entry.amount}`;
    case 'raise': return `${entry.playerName} raised to ${entry.amount}`;
    case 'allIn': return `${entry.playerName} ALL IN ${entry.amount}`;
  }
}

function actionIcon(action: ActionHistoryEntry['action']): string {
  switch (action) {
    case 'fold': return '🃏';
    case 'check': return '✓';
    case 'call': return '📞';
    case 'raise': return '⬆️';
    case 'allIn': return '🔥';
  }
}

export function ActionLog({ actions }: ActionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new actions
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [actions.length]);

  if (actions.length === 0) return null;

  return (
    <div className="px-4 py-1">
      <div
        ref={scrollRef}
        className="max-h-[72px] overflow-y-auto scrollbar-hide space-y-0.5"
      >
        {actions.map((entry, i) => (
          <p key={i} className="text-[11px] text-(--text-muted) leading-tight">
            <span className="mr-1">{actionIcon(entry.action)}</span>
            {formatAction(entry)}
          </p>
        ))}
      </div>
    </div>
  );
}
