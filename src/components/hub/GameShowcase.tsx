'use client';

import { useCallback, useState } from 'react';
import { GAME_REGISTRY } from '@/lib/gameRegistry';
import type { GameDefinition } from '@/lib/gameRegistry';
import RulesSheet from '@/components/shared/RulesSheet';
import { ChevronRightIcon } from '@/components/shared/Icons';
import { GameBadge, GameMeta, gameAccentStyle } from '@/components/hub/GameCard';

/**
 * GameShowcase — displayed on the home page.
 * Shows what games are available; tapping one opens its rules.
 */
export default function GameShowcase() {
  const [rulesFor, setRulesFor] = useState<string | null>(null);
  const closeRules = useCallback(() => setRulesFor(null), []);

  return (
    <section className="w-full max-w-sm mx-auto" aria-labelledby="showcase-heading">
      <div className="flex items-baseline justify-between mb-3 px-0.5">
        <h2 id="showcase-heading" className="text-xs font-semibold uppercase tracking-[0.14em] text-(--text-muted)">
          What you can play
        </h2>
        <span className="text-xs text-(--text-muted)">Tap for rules</span>
      </div>

      <ul className="space-y-2.5">
        {GAME_REGISTRY.map((game, i) => (
          <li key={game.id} className="animate-slide-up" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}>
            <ShowcaseCard game={game} onOpen={() => setRulesFor(game.id)} />
          </li>
        ))}
      </ul>

      {rulesFor && <RulesSheet gameId={rulesFor} onClose={closeRules} />}
    </section>
  );
}

function ShowcaseCard({ game, onOpen }: { game: GameDefinition; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="showcase-card accent-surface w-full text-left rounded-2xl border border-(--border) p-3.5 flex items-center gap-3"
      style={gameAccentStyle(game)}
    >
      <span className="icon-tile w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-2xl" aria-hidden="true">
        {game.icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-heading text-[15px] font-semibold text-(--text-primary)">{game.name}</span>
          {game.badge && <GameBadge>{game.badge}</GameBadge>}
        </span>
        <span className="block mt-0.5 text-[13px] leading-snug text-(--text-secondary)">{game.hook}</span>
        <GameMeta game={game} className="mt-2" />
        <span className="sr-only">. Show how to play.</span>
      </span>
      <ChevronRightIcon size={18} className="shrink-0 text-(--text-muted)" />
    </button>
  );
}
