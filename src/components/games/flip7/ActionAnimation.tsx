'use client';

import type { CSSProperties } from 'react';
import type { Flip7ActionEvent } from '@/types/games/flip7';
import { ACTION_CARD_LABELS } from '@/types/games/flip7';

interface ActionAnimationProps {
  action: Flip7ActionEvent;
  myId: string;
}

// One-shot "attack" when a Freeze or Flip Three is played: the icon flies in,
// an impact ring bursts, and a label says who hit whom. The player who got hit
// also sees a vignette in the card's color around the screen edges.
export default function ActionAnimation({ action, myId }: ActionAnimationProps) {
  const info = ACTION_CARD_LABELS[action.type];
  const hitsMe = action.targetId === myId;
  const isSelf = action.byId === action.targetId;
  const by = action.byId === myId ? 'You' : action.byName;
  const target = isSelf
    ? (action.byId === myId ? 'yourself' : 'themselves')
    : (hitsMe ? 'you' : action.targetName);
  const text = action.type === 'freeze'
    ? `${by} froze ${target}!`
    : `${by} made ${target} flip three!`;

  const ink = { '--f7-ink': info.color } as CSSProperties;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none" aria-live="polite">
      <div className="f7-reveal-backdrop" />
      {hitsMe && <div className="f7-self-hit" style={ink} />}

      <div className="relative flex items-center justify-center">
        <div
          className="absolute h-28 w-28 rounded-full flip7-impact-burst"
          style={{ background: `color-mix(in srgb, ${info.color} 25%, transparent)`, boxShadow: `0 0 0 2px ${info.color}` }}
        />
        <div className="text-7xl flip7-action-fly" style={{ filter: `drop-shadow(0 0 14px ${info.color})` }} aria-hidden="true">
          {info.icon}
        </div>
      </div>

      <p
        className="relative mt-7 rounded-full px-4 py-2 text-sm font-bold flip7-label-out"
        style={{
          color: info.color,
          background: `color-mix(in srgb, ${info.color} 14%, var(--bg-card))`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${info.color} 40%, transparent)`,
        }}
      >
        {text}
      </p>
      {action.auto && (
        <p className="relative mt-2 text-[11px] text-(--text-secondary) flip7-label-out">
          Time ran out, so the target was picked at random
        </p>
      )}
    </div>
  );
}
