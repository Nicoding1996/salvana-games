'use client';

import { usePoker } from '@/lib/games/poker/usePoker';
import { PlayerRing } from './PlayerRing';
import { CommunityCards } from './CommunityCards';
import { CardPeek } from './CardPeek';
import { ActionBar } from './ActionBar';
import { PotDisplay } from './PotDisplay';
import { Showdown } from './Showdown';
import { GameOver } from './GameOver';

export function PokerGame() {
  const { state, showdown, superlatives, turnTimer, reactions, fold, check, call, raise, allIn, sendReaction, endGame, rematch } = usePoker();

  if (!state) return null;

  if (state.phase === 'finished') {
    return (
      <GameOver
        state={state}
        superlatives={superlatives}
        onEndGame={endGame}
        onRematch={rematch}
      />
    );
  }

  const showShowdown = showdown && (state.phase === 'showdown' || state.phase === 'roundEnd');
  const isFoldWin = state.phase === 'roundEnd' && !showdown;

  return (
    <div className="flex flex-col h-full w-full" data-game="poker">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm text-(--text-secondary)">
          ♠️ Hand #{state.handNumber}
        </span>
        <span className="text-sm text-(--text-secondary)">
          Blinds: {state.blindLevel}/{state.blindLevel * 2}
        </span>
      </div>

      {/* Player Ring */}
      <PlayerRing
        players={state.players}
        activePlayerId={state.activePlayerId}
        reactions={reactions}
      />

      {/* Pot Display */}
      <PotDisplay pots={state.pots} />

      {/* Community Cards */}
      <CommunityCards
        cards={state.communityCards}
        phase={state.phase}
      />

      {/* Showdown Overlay */}
      {showShowdown && showdown && (
        <Showdown result={showdown} />
      )}

      {/* Fold Win message */}
      {isFoldWin && (
        <div className="px-4 py-6 text-center animate-[fadeIn_0.3s_ease-out]">
          <p className="text-lg font-semibold text-(--game-secondary)">
            {state.players.find(p => !p.folded && p.alive)?.name} takes the pot!
          </p>
          <p className="text-sm text-(--text-muted) mt-1">Everyone else folded</p>
          <p className="text-xs text-(--text-muted) mt-2">Next hand starting...</p>
        </div>
      )}

      {/* Your Hole Cards */}
      {!showShowdown && !isFoldWin && (
        <CardPeek
          cards={state.myCards}
          handStrength={state.myHandStrength}
        />
      )}

      {/* Action Bar — only during active betting phases */}
      {!showShowdown && !isFoldWin && state.isMyTurn && ['preflop', 'flop', 'turn', 'river'].includes(state.phase) && (
        <ActionBar
          callAmount={state.callAmount}
          minRaise={state.minRaise}
          currentBet={state.currentBet}
          myChips={state.players.find(p => p.id === state.activePlayerId)?.chips || 0}
          potTotal={state.pots.reduce((sum, p) => sum + p.amount, 0)}
          onFold={fold}
          onCheck={check}
          onCall={call}
          onRaise={raise}
          onAllIn={allIn}
          turnTimer={turnTimer}
        />
      )}

      {/* Waiting indicator when not your turn */}
      {!showShowdown && !isFoldWin && !state.isMyTurn && ['preflop', 'flop', 'turn', 'river'].includes(state.phase) && (
        <div className="px-4 py-3 text-center">
          <p className="text-sm text-(--text-secondary)">
            {state.activePlayerId
              ? `Waiting for ${state.players.find(p => p.id === state.activePlayerId)?.name}...`
              : 'Waiting...'}
          </p>
          {turnTimer !== null && turnTimer <= 10 && (
            <p className="text-xs text-(--danger) animate-pulse mt-1">{turnTimer}s</p>
          )}
          {/* Reaction buttons */}
          <div className="flex justify-center gap-3 mt-3">
            {['😤', '😎', '🤔', '💀', '🔥'].map(emoji => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="text-2xl active:scale-125 transition-transform"
                aria-label={`Send ${emoji} reaction`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
