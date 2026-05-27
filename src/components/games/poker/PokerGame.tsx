'use client';

import { useState, useEffect, useRef } from 'react';
import { usePoker } from '@/lib/games/poker/usePoker';
import { PlayerRing } from './PlayerRing';
import { CommunityCards } from './CommunityCards';
import { CardPeek } from './CardPeek';
import { ActionBar } from './ActionBar';
import { PotDisplay } from './PotDisplay';
import { Showdown } from './Showdown';
import { GameOver } from './GameOver';
import { ActionLog } from './ActionLog';

export function PokerGame() {
  const { state, showdown, superlatives, turnTimer, reactions, fold, check, call, raise, allIn, sendReaction, endGame, rematch } = usePoker();
  const [isDealing, setIsDealing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prevHandRef = useRef<number>(0);
  const prevBlindRef = useRef<number>(0);
  const prevActionCountRef = useRef<number>(0);

  // Dealing animation: show briefly when hand number changes
  useEffect(() => {
    if (!state) return;
    if (prevHandRef.current !== 0 && state.handNumber !== prevHandRef.current) {
      setIsDealing(true);
      const timer = setTimeout(() => setIsDealing(false), 1500);
      return () => clearTimeout(timer);
    }
    prevHandRef.current = state.handNumber;
  }, [state?.handNumber]);

  // Blind increase notification
  useEffect(() => {
    if (!state) return;
    if (prevBlindRef.current !== 0 && state.blindLevel !== prevBlindRef.current) {
      setToast(`⬆️ Blinds now ${state.blindLevel}/${state.blindLevel * 2}`);
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
    prevBlindRef.current = state.blindLevel;
  }, [state?.blindLevel]);

  // Action feed: show toast when someone acts (fold/raise/all-in)
  useEffect(() => {
    if (!state) return;
    const currentCount = state.actionHistory.length;
    if (prevActionCountRef.current > 0 && currentCount > prevActionCountRef.current) {
      const lastAction = state.actionHistory[currentCount - 1];
      if (lastAction && lastAction.action !== 'check') {
        let msg = '';
        switch (lastAction.action) {
          case 'fold': msg = `${lastAction.playerName} folded`; break;
          case 'raise': msg = `${lastAction.playerName} raised to ${lastAction.amount}`; break;
          case 'allIn': msg = `🔥 ${lastAction.playerName} ALL IN!`; break;
          case 'call': msg = `${lastAction.playerName} called ${lastAction.amount}`; break;
        }
        if (msg) {
          setToast(msg);
          const timer = setTimeout(() => setToast(null), 2500);
          return () => clearTimeout(timer);
        }
      }
    }
    prevActionCountRef.current = currentCount;
  }, [state?.actionHistory.length]);

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
  const isBettingPhase = ['preflop', 'flop', 'turn', 'river'].includes(state.phase);
  const amIAlive = state.amIAlive !== undefined ? state.amIAlive : true;

  return (
    <div className="flex flex-col h-full w-full" data-game="poker">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm text-(--text-secondary)">
          ♠️ Hand #{state.handNumber}
        </span>
        <div className="text-right">
          <span className="text-sm text-(--text-secondary)">
            Blinds: {state.blindLevel}/{state.blindLevel * 2}
          </span>
          {state.nextBlindIncrease <= 2 && state.nextBlindIncrease > 0 && (
            <span className="block text-[10px] text-(--brand)">
              ↑ in {state.nextBlindIncrease} hand{state.nextBlindIncrease !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-(--bg-elevated) border border-(--border) rounded-lg shadow-lg animate-[slideUp_0.3s_ease-out]">
          <p className="text-sm text-(--text-primary) whitespace-nowrap">{toast}</p>
        </div>
      )}

      {/* Dealing animation overlay */}
      {isDealing && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="text-center animate-[fadeIn_0.3s_ease-out]">
            <p className="text-2xl">🃏</p>
            <p className="text-sm text-(--text-secondary) mt-1">Dealing...</p>
          </div>
        </div>
      )}

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

      {/* Action Log */}
      {isBettingPhase && state.actionHistory.length > 0 && (
        <ActionLog actions={state.actionHistory} />
      )}

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

      {/* Eliminated spectator banner */}
      {!amIAlive && !showShowdown && !isFoldWin && (
        <div className="px-4 py-6 text-center">
          <p className="text-lg text-(--text-muted)">💀 You&apos;re out</p>
          <p className="text-sm text-(--text-muted) mt-1">Spectating...</p>
        </div>
      )}

      {/* Your Hole Cards */}
      {amIAlive && !showShowdown && !isFoldWin && (
        <CardPeek
          cards={state.myCards}
          handStrength={state.myHandStrength}
        />
      )}

      {/* Action Bar — only during active betting phases */}
      {amIAlive && !showShowdown && !isFoldWin && state.isMyTurn && isBettingPhase && (
        <ActionBar
          callAmount={state.callAmount}
          minRaise={state.minRaise}
          currentBet={state.currentBet}
          myChips={state.players.find(p => p.id === state.activePlayerId)?.chips || 0}
          potTotal={state.pots.reduce((sum, p) => sum + p.amount, 0)}
          isPreflop={state.phase === 'preflop'}
          onFold={fold}
          onCheck={check}
          onCall={call}
          onRaise={raise}
          onAllIn={allIn}
          turnTimer={turnTimer}
        />
      )}

      {/* Waiting indicator when not your turn */}
      {amIAlive && !showShowdown && !isFoldWin && !state.isMyTurn && isBettingPhase && (
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
