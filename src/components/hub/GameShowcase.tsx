'use client';

import { GAME_REGISTRY, DIFFICULTY_INFO } from '@/lib/gameRegistry';
import type { GameDefinition } from '@/lib/gameRegistry';

/** 
 * GameShowcase — displayed on the home page.
 * Shows what games are available so people know what they're signing up for.
 */
export default function GameShowcase() {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-(--text-muted)">
          What you can play
        </h2>
        <span className="text-[10px] text-(--text-muted)">{GAME_REGISTRY.length} games</span>
      </div>

      <div className="space-y-2">
        {GAME_REGISTRY.map((game) => (
          <ShowcaseCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}

function ShowcaseCard({ game }: { game: GameDefinition }) {
  return (
    <div className="relative rounded-xl bg-(--bg-card) border border-(--border) overflow-hidden">
      {/* Accent left stripe */}
      <div
        className="absolute top-0 left-0 bottom-0 w-[3px]"
        style={{ background: game.accentHex, opacity: 0.6 }}
      />

      {/* Badge */}
      {game.badge && (
        <div
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase"
          style={{ background: `${game.accentHex}20`, color: game.accentHex }}
        >
          {game.badge}
        </div>
      )}

      <div className="p-3 pl-4">
        {/* Header row */}
        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none">{game.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-(--text-primary)">{game.name}</h3>
              <span className="text-[9px] text-(--text-muted)">{game.minPlayers}–{game.maxPlayers}p</span>
              <span className="text-[9px] text-(--text-muted)">·</span>
              <span className="text-[9px] text-(--text-muted)">{game.duration}</span>
            </div>
            <p className="text-[11px] text-(--text-secondary) mt-0.5">{game.hook}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
