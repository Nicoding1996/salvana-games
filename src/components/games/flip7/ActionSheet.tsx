'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Flip7PlayerInfo, PendingAction } from '@/types/games/flip7';
import { ACTION_CARD_LABELS, computeRoundScore } from '@/types/games/flip7';
import { CardFace, ModifierChip, NumberCard, SecondChanceChip } from './CardArt';
import TimerBar from '@/components/shared/TimerBar';

interface ActionSheetProps {
  pending: PendingAction;
  players: Flip7PlayerInfo[];
  myId: string;
  onSelect: (targetId: string) => void;
  secondsLeft: number | null;
  totalSeconds: number;
}

// Bottom sheet where the player who drew Freeze / Flip Three picks a target.
// Mount it with a key per pending action so the "picked" lock resets.
export default function ActionSheet({ pending, players, myId, onSelect, secondsLeft, totalSeconds }: ActionSheetProps) {
  const info = ACTION_CARD_LABELS[pending.cardKind];
  const isFreeze = pending.cardKind === 'freeze';

  const targets = players.filter(p => pending.eligibleTargets.includes(p.id) && p.roundStatus === 'active');
  const ordered = [...targets.filter(p => p.id !== myId), ...targets.filter(p => p.id === myId)];
  const onlyTarget = ordered.length === 1 ? ordered[0].id : null;

  // Guard against double taps: only the first pick is sent.
  const sentRef = useRef(false);
  const [picked, setPicked] = useState<string | null>(null);
  const pick = useCallback((id: string) => {
    if (sentRef.current) return;
    sentRef.current = true;
    setPicked(id);
    onSelect(id);
  }, [onSelect]);

  // Only one possible target (usually yourself): pick it after a short beat.
  useEffect(() => {
    if (!onlyTarget) return;
    const t = setTimeout(() => pick(onlyTarget), 1600);
    return () => clearTimeout(t);
  }, [onlyTarget, pick]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="f7-action-title">
      <div className="absolute inset-0 bg-black/55 animate-fade-in" />

      <div className="relative w-full max-w-lg rounded-t-3xl border-t border-(--border-light) bg-(--bg-card) px-4 pt-3 f7-safe-bottom flip7-sheet-up">
        <div className="flex justify-center pb-2">
          <div className="h-1 w-10 rounded-full bg-(--border-light)" />
        </div>

        <div className="mb-3 flex items-center gap-3">
          <CardFace card={{ type: 'action', kind: pending.cardKind }} size="sm" />
          <div className="min-w-0 flex-1">
            <h3 id="f7-action-title" className="text-base font-bold text-(--text-primary)">
              {isFreeze ? 'Who do you freeze?' : 'Who has to flip three?'}
            </h3>
            <p className="text-xs text-(--text-muted)">{info.hint}</p>
          </div>
          {secondsLeft !== null && (
            <span
              className="shrink-0 font-mono text-sm font-bold tabular-nums"
              style={{ color: secondsLeft <= 5 ? 'var(--danger)' : 'var(--text-secondary)' }}
            >
              {secondsLeft}s
            </span>
          )}
        </div>
        {secondsLeft !== null && (
          <div className="mb-3">
            <TimerBar seconds={secondsLeft} total={totalSeconds} />
          </div>
        )}

        <ul className="max-h-[46dvh] space-y-2 overflow-y-auto pb-1">
          {ordered.map(p => {
            const isMe = p.id === myId;
            const banked = computeRoundScore(p.visibleCards, p.modifiers, false);
            const sorted = [...p.visibleCards].sort((a, b) => a - b);
            const chosen = picked === p.id;
            const hint = isFreeze
              ? `Banks ${banked} and sits out the round`
              : `${p.cardCount} card${p.cardCount === 1 ? '' : 's'} now, 3 more to come`;
            return (
              <li key={p.id}>
                <button
                  onClick={() => pick(p.id)}
                  disabled={picked !== null}
                  className={`flex min-h-[60px] w-full items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98] ${
                    chosen ? 'border-(--game-accent) bg-(--game-accent)/10' : 'border-(--border) bg-(--bg-elevated)'
                  } ${picked !== null && !chosen ? 'opacity-40' : ''}`}
                >
                  <span className="text-xl" aria-hidden="true">{p.avatar}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-(--text-primary)">
                      {isMe ? 'You' : p.name} <span className="font-normal text-(--text-muted)">· {p.cumulativeScore} pts</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-[3px]">
                      {sorted.map(v => <NumberCard key={v} value={v} size="xs" />)}
                      {p.modifiers.map((m, i) => <ModifierChip key={`${m}-${i}`} kind={m} small />)}
                      {p.hasSecondChance && <SecondChanceChip small />}
                    </div>
                    <p className="mt-1 text-[11px] text-(--text-muted)">{hint}</p>
                  </div>
                  <span className="shrink-0 text-lg" aria-hidden="true">{chosen ? '✓' : info.icon}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {onlyTarget && (
          <p className="mt-2 text-center text-[11px] text-(--text-muted)">
            Nobody else is still in, so it has to be you.
          </p>
        )}
      </div>
    </div>
  );
}
