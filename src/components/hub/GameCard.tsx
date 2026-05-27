'use client';

import { useState } from 'react';
import type { GameDefinition } from '@/lib/gameRegistry';
import { DIFFICULTY_INFO } from '@/lib/gameRegistry';

/* ============================================
   GameSelector — Horizontal pill strip + detail panel
   Compact: takes ~56px for pills, optional detail below
   ============================================ */

interface GameSelectorProps {
  games: GameDefinition[];
  selectedGameId: string;
  isHost: boolean;
  playerCount: number;
  onSelect: (gameId: string) => void;
}

export function GameSelector({ games, selectedGameId, isHost, playerCount, onSelect }: GameSelectorProps) {
  const [showDetail, setShowDetail] = useState(false);
  const selectedGame = games.find(g => g.id === selectedGameId) || games[0];

  const handlePillTap = (gameId: string) => {
    if (!isHost) return;
    if (gameId === selectedGameId) {
      setShowDetail(!showDetail);
    } else {
      onSelect(gameId);
      setShowDetail(false);
    }
  };

  const canPlay = playerCount >= selectedGame.minPlayers && playerCount <= selectedGame.maxPlayers;
  const tooFew = playerCount < selectedGame.minPlayers;
  const tooMany = playerCount > selectedGame.maxPlayers;

  return (
    <div className="mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-(--text-muted)">
          {isHost ? 'Choose a Game' : 'Playing'}
        </h2>
        <span className="text-[10px] text-(--text-muted)">{games.length} games</span>
      </div>

      {/* Horizontal pill strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin -mx-1 px-1">
        {games.map((game) => {
          const isActive = game.id === selectedGameId;
          return (
            <button
              key={game.id}
              onClick={() => handlePillTap(game.id)}
              disabled={!isHost}
              className={`game-pill shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all active:scale-95 ${
                isActive
                  ? 'game-pill-active'
                  : 'bg-(--bg-card) border border-(--border) opacity-60'
              } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
              style={isActive ? {
                background: `${game.accentHex}12`,
                borderColor: `${game.accentHex}50`,
                border: `1.5px solid ${game.accentHex}60`,
              } : undefined}
              aria-label={`${isActive ? 'Selected: ' : 'Select '}${game.name}`}
              aria-pressed={isActive}
            >
              <span className="text-base leading-none">{game.icon}</span>
              <span className={`text-xs font-medium whitespace-nowrap ${isActive ? 'text-(--text-primary)' : 'text-(--text-secondary)'}`}>
                {game.name}
              </span>
              {game.badge && (
                <span className="text-[7px] font-bold uppercase px-1 py-0.5 rounded-full" style={{ background: `${game.accentHex}25`, color: game.accentHex }}>
                  {game.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected game info bar — tappable to expand details */}
      <button
        onClick={() => isHost ? setShowDetail(!showDetail) : setShowDetail(!showDetail)}
        className="mt-2 w-full flex items-center gap-2 text-[10px] text-(--text-muted) py-1 active:opacity-70 transition-opacity"
        aria-label={showDetail ? 'Hide game details' : 'Show game details'}
        aria-expanded={showDetail}
      >
        <span>{selectedGame.minPlayers}–{selectedGame.maxPlayers} players</span>
        <span>·</span>
        <span>{selectedGame.duration}</span>
        <span>·</span>
        <span style={{ color: DIFFICULTY_INFO[selectedGame.difficulty].color }}>
          {DIFFICULTY_INFO[selectedGame.difficulty].label}
        </span>
        <span className="ml-auto text-[9px] text-(--text-muted) underline underline-offset-2 decoration-dotted">
          {showDetail ? 'hide' : 'how to play'}
        </span>
      </button>

      {/* Player count warning */}
      {!canPlay && (
        <div className="mt-1.5 text-[11px] font-medium" style={{ color: tooMany ? 'var(--danger)' : 'var(--text-muted)' }}>
          {tooFew && `Need ${selectedGame.minPlayers - playerCount} more player${selectedGame.minPlayers - playerCount !== 1 ? 's' : ''}`}
          {tooMany && `Too many players (max ${selectedGame.maxPlayers})`}
        </div>
      )}

      {/* Expandable detail panel — quick rules */}
      {showDetail && (
        <div className="mt-2 p-3 rounded-xl bg-(--bg-card) border border-(--border) animate-fade-in">
          <p className="text-xs text-(--text-primary) leading-relaxed">{selectedGame.howToPlay}</p>
          <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-(--border)">
            <span className="text-[10px] text-(--text-muted)">👥 Best with {selectedGame.bestWith}</span>
            <span className="text-[10px] text-(--text-muted)">⏱ {selectedGame.duration}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================
   Legacy export for backward compatibility
   ============================================ */
export default function GameCard() {
  return null; // Use GameSelector instead
}
