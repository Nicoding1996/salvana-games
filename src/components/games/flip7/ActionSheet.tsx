'use client';

import type { Flip7PlayerInfo, ModifierCardKind } from '@/types/games/flip7';
import { ACTION_CARD_LABELS, MODIFIER_CARD_LABELS } from '@/types/games/flip7';

interface ActionSheetProps {
  type: 'action' | 'modifier';
  cardKind: string;
  eligibleTargets: string[];
  players: Flip7PlayerInfo[];
  onSelect: (targetId: string) => void;
  onKeep?: () => void;
  turnTimer: number | null;
}

export default function ActionSheet({
  type, cardKind, eligibleTargets, players, onSelect, onKeep, turnTimer
}: ActionSheetProps) {
  const targetPlayers = players.filter(p => eligibleTargets.includes(p.id));

  // Auto-select if only one target
  if (type === 'action' && targetPlayers.length === 1) {
    // Will auto-fire on mount — but let's show briefly for UX
  }

  const getHeader = () => {
    if (type === 'action') {
      const label = ACTION_CARD_LABELS[cardKind as keyof typeof ACTION_CARD_LABELS];
      if (!label) return { icon: '🃏', title: 'Choose target', color: '#fff' };
      const title = cardKind === 'freeze' ? 'Choose who to freeze:' : 'Choose who draws 3:';
      return { icon: label.icon, title, color: label.color };
    }
    const label = MODIFIER_CARD_LABELS[cardKind as ModifierCardKind];
    if (!label) return { icon: '🃏', title: 'Keep or give?', color: '#fff' };
    return { icon: label.display, title: 'Keep or give away?', color: label.color };
  };

  const header = getHeader();

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-(--bg-card) border-t border-(--border) rounded-t-2xl p-4 pb-8 animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{header.icon}</span>
          <h3 className="text-sm font-bold text-(--text-primary)">{header.title}</h3>
          {turnTimer !== null && (
            <span className={`ml-auto text-sm font-mono font-bold ${
              turnTimer <= 5 ? 'text-(--danger)' : 'text-(--text-muted)'
            }`}>
              {turnTimer}s
            </span>
          )}
        </div>

        {/* Keep button (modifier only) */}
        {type === 'modifier' && onKeep && (
          <button
            onClick={onKeep}
            className="w-full mb-3 py-3 rounded-xl bg-(--game-accent)/20 border border-(--game-accent)/30 text-(--game-accent) font-semibold text-sm active:scale-[0.97] transition-all"
          >
            Keep {MODIFIER_CARD_LABELS[cardKind as ModifierCardKind]?.display || cardKind}
          </button>
        )}

        {/* Target list */}
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {targetPlayers.map((player) => (
            <button
              key={player.id}
              onClick={() => onSelect(player.id)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-(--bg-elevated) border border-(--border) active:scale-[0.98] transition-all"
            >
              <span className="text-xl">{player.avatar}</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-(--text-primary)">{player.name}</p>
                <p className="text-[10px] text-(--text-muted)">
                  {player.cardCount} cards · {player.cumulativeScore} pts
                </p>
              </div>
              <span className="text-xs text-(--text-muted)">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
