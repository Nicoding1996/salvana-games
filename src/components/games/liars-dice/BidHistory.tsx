'use client';

import { useEffect, useRef } from 'react';
import type { BidHistoryEntry } from '@/types/games/liars-dice';
import DiceIcon from './DiceIcon';

interface BidHistoryProps {
  entries: BidHistoryEntry[];
}

export default function BidHistory({ entries }: BidHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-3 text-xs text-(--text-muted)">
        No bids yet — first player is up
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="max-h-[130px] overflow-y-auto space-y-1 px-1 py-1 scrollbar-thin"
      role="log"
      aria-label="Bid history"
    >
      {entries.map((entry, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 text-sm py-1.5 px-2.5 rounded-xl animate-fade-in ${
            entry.type === 'liar'
              ? 'bg-(--danger)/10 border border-(--danger)/15'
              : entry.type === 'spotOn'
              ? 'bg-(--game-secondary)/10 border border-(--game-secondary)/15'
              : i === entries.length - 1
              ? 'bg-(--bg-elevated) border border-(--border)'
              : 'border border-transparent'
          }`}
        >
          <span className="text-base shrink-0">{entry.playerAvatar}</span>
          <span className="text-(--text-secondary) truncate max-w-[72px] text-xs font-medium">
            {entry.playerName}
          </span>

          <div className="flex-1" />

          {entry.type === 'bid' && (
            <div className="flex items-center gap-1">
              <span className="text-(--text-primary) font-bold text-sm">{entry.quantity}</span>
              <span className="text-(--text-muted) text-xs">×</span>
              <DiceIcon value={entry.faceValue} size={22} />
            </div>
          )}

          {entry.type === 'liar' && (
            <span className="text-(--danger) font-bold text-sm">🤥 LIAR!</span>
          )}

          {entry.type === 'spotOn' && (
            <span className="text-(--game-secondary) font-bold text-sm">🎯 SPOT ON!</span>
          )}
        </div>
      ))}
    </div>
  );
}
