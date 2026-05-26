'use client';

import type { ShowdownResult } from '@/types/games/poker';
import { PlayingCard } from './PlayingCard';
import Confetti from '@/components/shared/Confetti';

interface ShowdownProps {
  result: ShowdownResult;
}

export function Showdown({ result }: ShowdownProps) {
  return (
    <div className="px-4 py-3 space-y-4 animate-[fadeIn_0.5s_ease-out]">
      {/* Confetti for winners */}
      {result.winners.length > 0 && <Confetti />}

      <h3 className="text-center text-lg font-(--font-heading) text-(--text-primary)">
        Showdown
      </h3>

      {/* Each player's hand */}
      <div className="space-y-3">
        {result.players.map((player, idx) => (
          <div
            key={player.playerId}
            className={`
              flex items-center gap-3 p-3 rounded-xl
              ${player.isWinner
                ? 'bg-(--game-secondary)/10 border border-(--game-secondary)/30'
                : 'bg-(--bg-card) border border-(--border)'}
              animate-[slideUp_0.4s_ease-out]
            `}
            style={{ animationDelay: `${idx * 200}ms` }}
          >
            {/* Avatar + Name */}
            <div className="flex flex-col items-center min-w-[48px]">
              <span className="text-xl">{player.avatar}</span>
              <span className="text-[11px] text-(--text-primary) truncate max-w-[48px]">
                {player.playerName}
              </span>
              {player.isWinner && (
                <span className="text-[10px] text-(--game-secondary) font-bold">
                  +{player.potWon} 🪙
                </span>
              )}
            </div>

            {/* Cards */}
            <div className="flex gap-1">
              {player.holeCards.map((card, i) => (
                <PlayingCard
                  key={i}
                  card={card}
                  size="sm"
                  highlighted={player.isWinner}
                />
              ))}
            </div>

            {/* Hand description */}
            <div className="flex-1 text-right">
              <p className={`text-sm font-semibold ${player.isWinner ? 'text-(--game-secondary)' : 'text-(--text-secondary)'}`}>
                {player.handEvaluation.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
