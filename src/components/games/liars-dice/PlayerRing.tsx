'use client';

import { useEffect, useRef } from 'react';
import type { LiarsDicePhase, LiarsDicePlayerInfo, LiarsDiceTurnTimer } from '@/types/games/liars-dice';

export function Hearts({ lives, max, size = 'sm' }: { lives: number; max: number; size?: 'sm' | 'md' }) {
  return (
    <span className={`ld-hearts ${size === 'md' ? 'text-base' : 'text-[11px]'}`} aria-label={`${lives} of ${max} lives`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={`${i}-${i < lives}`} className={i < lives ? 'ld-heart' : 'ld-heart ld-heart-lost animate-life-lost'} aria-hidden="true">
          ♥
        </span>
      ))}
    </span>
  );
}

interface PlayerRingProps {
  players: LiarsDicePlayerInfo[];
  phase: LiarsDicePhase;
  activePlayerId: string | null;
  myId: string | null;
  timer: LiarsDiceTurnTimer | null;
}

/** Everyone at the table in turn order (clockwise), with lives and whose turn it is. */
export default function PlayerRing({ players, phase, activePlayerId, myId, timer }: PlayerRingProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const inGame = players.filter(p => p.alive);
  const activeIndex = inGame.findIndex(p => p.id === activePlayerId);
  const nextId = phase === 'bidding' && activeIndex >= 0 && inGame.length > 2
    ? inGame[(activeIndex + 1) % inGame.length].id
    : null;

  // Keep whoever is on turn in view
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activePlayerId]);

  return (
    <ol
      ref={listRef}
      className="no-scrollbar flex snap-x items-stretch gap-1 overflow-x-auto px-3 pb-1 pt-2"
      aria-label="Players in turn order"
    >
      {players.map((p, i) => {
        const isActive = phase === 'bidding' && p.id === activePlayerId;
        const isMe = p.id === myId;
        const out = !p.alive;
        const myTimer = isActive && timer?.playerId === p.id ? timer : null;
        let tag: string | null = null;
        if (p.left) tag = 'left';
        else if (!p.connected && !out) tag = 'away';
        else if (phase === 'rolling' && !out) tag = p.rolled ? '✓ rolled' : 'rolling…';
        else if (p.id === nextId) tag = 'next';

        return (
          <li key={p.id} className="flex shrink-0 snap-center items-stretch gap-1">
            {i > 0 && <span className="self-center text-[10px] text-(--text-muted)" aria-hidden="true">›</span>}
            <div
              data-active={isActive ? 'true' : undefined}
              className={`ld-seat relative flex min-h-[76px] w-[62px] flex-col items-center justify-center rounded-2xl px-1 pb-1.5 pt-1.5 ${
                isActive ? 'ld-seat-active' : ''
              } ${out ? 'animate-elimination' : ''}`}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="text-xl leading-none" aria-hidden="true">{p.avatar}</span>
              <span className={`mt-1 max-w-full truncate text-[11px] font-semibold ${isMe ? 'text-(--brand)' : 'text-(--text-primary)'}`}>
                {isMe ? 'You' : p.name}
              </span>
              {out ? (
                <span className="text-[11px] leading-4" aria-label="Out">💀</span>
              ) : (
                <Hearts lives={p.lives} max={p.maxLives} />
              )}
              {tag && (
                <span className={`mt-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  tag === 'away' || tag === 'left' ? 'text-(--danger)' : tag === '✓ rolled' ? 'text-(--success)' : 'text-(--text-muted)'
                }`}>
                  {tag}
                </span>
              )}
              {myTimer && myTimer.total > 0 && (
                <span className="absolute inset-x-2 bottom-0.5 h-[3px] overflow-hidden rounded-full bg-(--bg-primary)/60" aria-hidden="true">
                  {/* Slides out (transform) instead of shrinking (width), so it doesn't repaint every frame */}
                  <span
                    className="block h-full w-full rounded-full transition-transform duration-1000 ease-linear"
                    style={{
                      transform: `translateX(${(myTimer.secondsLeft / myTimer.total) * 100 - 100}%)`,
                      background: myTimer.secondsLeft <= 5 ? 'var(--danger)' : 'var(--game-secondary)',
                    }}
                  />
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
