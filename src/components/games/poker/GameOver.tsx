'use client';

import type { PokerClientState, PokerSuperlative } from '@/types/games/poker';
import Confetti from '@/components/shared/Confetti';

interface GameOverProps {
  state: PokerClientState;
  superlatives: PokerSuperlative[];
  onEndGame: () => void;
  onRematch: () => void;
}

export function GameOver({ state, superlatives, onEndGame, onRematch }: GameOverProps) {
  // Winner is the last player alive (most chips)
  const winner = state.players
    .filter(p => p.alive)
    .sort((a, b) => b.chips - a.chips)[0];

  // Standings: alive first (by chips), then eliminated (reverse order)
  const standings = [
    ...state.players.filter(p => p.alive).sort((a, b) => b.chips - a.chips),
    ...state.eliminationOrder.slice().reverse().map(e =>
      state.players.find(p => p.id === e.id)
    ).filter(Boolean),
  ];

  return (
    <div className="flex flex-col items-center px-4 py-6 h-full overflow-y-auto">
      <Confetti />

      {/* Winner */}
      {winner && (
        <div className="text-center mb-6 animate-[celebrate_0.6s_ease-out]">
          <span className="text-5xl">{winner.avatar}</span>
          <h2 className="text-2xl font-(--font-heading) text-(--text-primary) mt-2">
            {winner.name} Wins!
          </h2>
          <p className="text-(--game-secondary) text-lg">🪙 {winner.chips} chips</p>
          <p className="text-(--text-muted) text-sm mt-1">
            {state.handNumber} hands played
          </p>
        </div>
      )}

      {/* Superlatives */}
      {superlatives.length > 0 && (
        <div className="w-full max-w-sm mb-6">
          <h3 className="text-sm text-(--text-secondary) uppercase tracking-wide mb-2 text-center">
            Awards
          </h3>
          <div className="space-y-2">
            {superlatives.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-(--bg-card) border border-(--border) rounded-lg px-3 py-2"
              >
                <span className="text-xl">{s.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-(--text-primary)">{s.title}</p>
                  <p className="text-xs text-(--text-secondary)">{s.playerName} — {s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final Standings */}
      <div className="w-full max-w-sm mb-6">
        <h3 className="text-sm text-(--text-secondary) uppercase tracking-wide mb-2 text-center">
          Final Standings
        </h3>
        <div className="space-y-1">
          {standings.map((player, i) => player && (
            <div
              key={player.id}
              className="flex items-center gap-2 bg-(--bg-card) border border-(--border) rounded-lg px-3 py-2"
            >
              <span className="text-sm font-bold text-(--text-muted) w-5">#{i + 1}</span>
              <span className="text-lg">{player.avatar}</span>
              <span className="flex-1 text-sm text-(--text-primary)">{player.name}</span>
              <span className="text-xs text-(--text-secondary)">
                {player.alive ? `🪙${player.chips}` : '💀'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={onRematch}
          className="flex-1 py-3 rounded-xl bg-(--game-accent) text-white font-semibold active:scale-95 transition-transform"
        >
          Rematch
        </button>
        <button
          onClick={onEndGame}
          className="flex-1 py-3 rounded-xl bg-(--bg-elevated) border border-(--border) text-(--text-primary) font-semibold active:scale-95 transition-transform"
        >
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
