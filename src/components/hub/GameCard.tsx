'use client';

import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { GameDefinition } from '@/lib/gameRegistry';
import { DIFFICULTY_INFO } from '@/lib/gameRegistry';
import RulesSheet from '@/components/shared/RulesSheet';
import { BookIcon, CheckIcon, ClockIcon, UsersIcon } from '@/components/shared/Icons';

/* ============================================
   Shared game-card pieces (home showcase + lobby selector)
   ============================================ */

/** Exposes a game's accent as --card-accent for the accent-* / game-tile CSS classes. */
export function gameAccentStyle(game: GameDefinition): CSSProperties {
  return { '--card-accent': game.accentHex } as CSSProperties;
}

export function GameBadge({ children }: { children: ReactNode }) {
  return (
    <span className="accent-text shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide leading-none bg-(--card-accent)/15 border border-(--card-accent)/30">
      {children}
    </span>
  );
}

/** Players · duration · difficulty. Spans only, so it can sit inside a button. */
export function GameMeta({ game, className = '' }: { game: GameDefinition; className?: string }) {
  const difficulty = DIFFICULTY_INFO[game.difficulty];
  return (
    <span className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--text-muted) ${className}`}>
      <span className="inline-flex items-center gap-1">
        <UsersIcon size={13} />
        {game.minPlayers}–{game.maxPlayers}
        <span className="sr-only"> players</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <ClockIcon size={13} />
        {game.duration}
      </span>
      <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: difficulty.color }}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
        {difficulty.label}
      </span>
    </span>
  );
}

/* ============================================
   GameSelector — lobby game picker
   Host: tile grid (every game visible, no scrolling) + selected-game card.
   Everyone else: just the selected-game card.
   ============================================ */

interface GameSelectorProps {
  games: GameDefinition[];
  selectedGameId: string;
  isHost: boolean;
  playerCount: number;
  onSelect: (gameId: string) => void;
}

export function GameSelector({ games, selectedGameId, isHost, playerCount, onSelect }: GameSelectorProps) {
  const [showRules, setShowRules] = useState(false);
  const closeRules = useCallback(() => setShowRules(false), []);
  const selectedGame = games.find(g => g.id === selectedGameId) || games[0];

  const handleSelect = (gameId: string) => {
    if (isHost && gameId !== selectedGameId) onSelect(gameId);
  };

  return (
    <section className="mb-5" aria-labelledby="game-select-heading">
      <div className="flex items-baseline justify-between mb-2.5 px-0.5">
        <h2 id="game-select-heading" className="text-xs font-semibold uppercase tracking-[0.14em] text-(--text-muted)">
          {isHost ? 'Choose a game' : "Host's pick"}
        </h2>
        {isHost && <span className="text-xs text-(--text-muted)">{games.length} games</span>}
      </div>

      {isHost && (
        <div className="grid grid-cols-3 gap-2 mb-3" role="group" aria-label="Games">
          {games.map((game) => (
            <GameTile
              key={game.id}
              game={game}
              selected={game.id === selectedGame.id}
              tooMany={playerCount > game.maxPlayers}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}

      {/* Keyed by game so switching games replays the fade-in for everyone in the room */}
      <SelectedGameCard
        key={selectedGame.id}
        game={selectedGame}
        playerCount={playerCount}
        onShowRules={() => setShowRules(true)}
      />

      {showRules && <RulesSheet gameId={selectedGame.id} onClose={closeRules} />}
    </section>
  );
}

function GameTile({ game, selected, tooMany, onSelect }: {
  game: GameDefinition;
  selected: boolean;
  tooMany: boolean;
  onSelect: (gameId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(game.id)}
      aria-pressed={selected}
      aria-label={tooMany ? `${game.name} (max ${game.maxPlayers} players)` : game.name}
      className={`game-tile relative min-h-[72px] rounded-2xl px-1.5 py-2.5 flex flex-col items-center justify-center gap-1.5 text-center ${
        tooMany && !selected ? 'opacity-50' : ''
      }`}
      style={gameAccentStyle(game)}
    >
      {selected && (
        <span className="absolute top-1.5 right-1.5 w-4.5 h-4.5 rounded-full bg-(--card-accent) text-(--bg-primary) flex items-center justify-center" aria-hidden="true">
          <CheckIcon size={11} strokeWidth={3.5} />
        </span>
      )}
      <span className="text-2xl leading-none" aria-hidden="true">{game.icon}</span>
      <span className={`text-xs font-semibold leading-tight ${selected ? 'text-(--text-primary)' : 'text-(--text-secondary)'}`}>
        {game.name}
      </span>
      {tooMany ? (
        <span className="text-[11px] font-medium leading-none text-(--danger)" aria-hidden="true">
          max {game.maxPlayers}
        </span>
      ) : game.badge ? (
        <GameBadge>{game.badge}</GameBadge>
      ) : null}
    </button>
  );
}

function SelectedGameCard({ game, playerCount, onShowRules }: {
  game: GameDefinition;
  playerCount: number;
  onShowRules: () => void;
}) {
  const needed = game.minPlayers - playerCount;
  const tooMany = playerCount > game.maxPlayers;

  const status = tooMany
    ? { text: `Too many players · max ${game.maxPlayers}`, textClass: 'text-(--danger)', dotClass: 'bg-(--danger)' }
    : needed > 0
      ? { text: `Need ${needed} more player${needed !== 1 ? 's' : ''}`, textClass: 'text-(--text-secondary)', dotClass: 'bg-(--brand) animate-soft-pulse' }
      : { text: `Ready · ${playerCount} player${playerCount !== 1 ? 's' : ''}`, textClass: 'text-(--success)', dotClass: 'bg-(--success)' };

  return (
    <div
      className="accent-surface accent-topline rounded-2xl border border-(--border) p-4 animate-fade-in"
      style={gameAccentStyle(game)}
    >
      <div className="flex items-center gap-3">
        <span className="icon-tile w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-2xl" aria-hidden="true">
          {game.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold leading-tight text-(--text-primary) truncate">{game.name}</h3>
            {game.badge && <GameBadge>{game.badge}</GameBadge>}
          </div>
          <GameMeta game={game} className="mt-1.5" />
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-(--text-secondary)">{game.hook}</p>

      <div className="mt-3 pt-3 border-t border-(--border) flex items-center justify-between gap-3">
        <p className={`flex items-center gap-2 text-xs font-medium ${status.textClass}`} role="status">
          <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${status.dotClass}`} aria-hidden="true" />
          {status.text}
        </p>
        <button
          type="button"
          onClick={onShowRules}
          aria-haspopup="dialog"
          className="shrink-0 h-11 px-3.5 -mr-1 rounded-xl flex items-center gap-1.5 text-xs font-semibold text-(--text-primary) bg-(--bg-elevated) border border-(--border-light) hover:border-(--card-accent)/50 active:scale-95 transition-[transform,border-color]"
        >
          <BookIcon size={14} className="accent-text" />
          How to play
        </button>
      </div>
    </div>
  );
}
