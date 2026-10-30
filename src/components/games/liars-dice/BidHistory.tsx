'use client';

import { useEffect, useRef } from 'react';
import type { BidHistoryEntry } from '@/types/games/liars-dice';
import DiceIcon from './DiceIcon';

interface BidHistoryProps {
  entries: BidHistoryEntry[];
  myId: string | null;
  wildOnes: boolean;
  /** One line with an inline label, so the bid builder below keeps its room */
  compact: boolean;
}

/** This round's bids as a trail of chips, newest on the right. */
export default function BidHistory({ entries, myId, wildOnes, compact }: BidHistoryProps) {
  const scrollRef = useRef<HTMLOListElement>(null);

  // Keep the newest bid in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [entries.length]);

  const bids = entries.filter(e => e.type === 'bid');
  if (bids.length < 2) return null; // the current bid card already shows the only bid

  return (
    <div className={compact ? 'flex items-center gap-2 px-4' : 'px-4'}>
      <p className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted) ${compact ? '' : 'mb-1'}`} aria-hidden="true">
        {compact ? 'Bids' : 'Bids this round'}
      </p>
      <ol ref={scrollRef} className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto py-0.5" aria-label="Bids this round" role="log">
        {bids.map((entry, i) => {
          const latest = i === bids.length - 1;
          return (
            <li key={i} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span className="text-[10px] text-(--text-muted)" aria-hidden="true">›</span>}
              <span
                className={`flex items-center gap-1 rounded-full border py-0.5 pl-1.5 pr-1 text-xs ${
                  latest ? 'border-(--game-accent)/50 bg-(--game-accent-dim) text-(--text-primary)' : 'border-(--border) bg-(--bg-card) text-(--text-secondary)'
                }`}
                aria-label={`${entry.playerId === myId ? 'You' : entry.playerName}: ${entry.quantity} × ${entry.faceValue}${entry.auto ? ' (auto)' : ''}`}
              >
                <span aria-hidden="true">{entry.playerAvatar}</span>
                <span className="font-bold tabular-nums">{entry.quantity}</span>
                <span className="text-(--text-muted)" aria-hidden="true">×</span>
                <DiceIcon value={entry.faceValue} size={18} wild={wildOnes} />
                {entry.auto && <span className="text-[10px]" aria-hidden="true">⏱️</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
