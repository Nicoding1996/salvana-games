'use client';

import { useState } from 'react';
import { useFlip7 } from '@/lib/games/flip7/useFlip7';
import type { useRoom } from '@/lib/hub/useRoom';
import CardDisplay from './CardDisplay';
import FlipAnimation from './FlipAnimation';
import PlayerStatus from './PlayerStatus';
import ActionSheet from './ActionSheet';
import RoundSummary from './RoundSummary';
import GameOver from './GameOver';

interface Flip7GameProps {
  roomHook: ReturnType<typeof useRoom>;
}

export default function Flip7Game({ roomHook }: Flip7GameProps) {
  const { playerId, isHost, connected, leaveRoom } = roomHook;
  const {
    gameState,
    turnTimer,
    lastFlipEvent,
    chaosSubmitted,
    hit,
    stay,
    useAction,
    giveModifier,
    chaosChoice,
    nextRound,
    endGame,
    rematch,
  } = useFlip7();

  const [showRules, setShowRules] = useState(gameState.round === 1);
  const [endGameConfirm, setEndGameConfirm] = useState(false);

  const { phase, players, isMyTurn, activePlayerId, settings, myCards,
    myModifiers, mySecondChances, myRoundStatus, pendingAction,
    pendingModifier, deckRemaining, round, activityLog,
    flipSevenAchievedBy, roundScores, winnerId } = gameState;

  const activePlayer = players.find(p => p.id === activePlayerId);
  const myPlayer = players.find(p => p.id === playerId);

  const handleEndGame = () => {
    if (!endGameConfirm) {
      setEndGameConfirm(true);
      setTimeout(() => setEndGameConfirm(false), 3000);
      return;
    }
    endGame();
  };

  // Rules overlay (first round only)
  if (showRules && gameState.round === 1 && phase === 'playing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto animate-fade-in" data-game="flip-7">
        <div className="bg-(--bg-card) border border-(--border) rounded-2xl p-6 space-y-4">
          <h2 className="text-xl font-bold text-(--text-primary) text-center">🃏 How to Play</h2>
          <div className="space-y-3 text-sm text-(--text-secondary)">
            <p>Each round, collect unique number cards (0–12) without drawing a duplicate.</p>
            <p>On your turn: <strong className="text-(--game-accent)">HIT</strong> to draw a card, or <strong>STAY</strong> to bank your points.</p>
            <p>Draw a duplicate? You <strong className="text-(--danger)">BUST</strong> — score 0 for the round.</p>
            <p>Collect 7 unique numbers? <strong className="text-(--game-accent)">FLIP 7!</strong> Round ends, you get +15 bonus points.</p>
            <ul className="list-disc list-inside space-y-1 pl-2 text-xs">
              <li>❄️ <strong>Freeze</strong> — force someone to stay</li>
              <li>⚡ <strong>Flip Three</strong> — force someone to draw 3 cards</li>
              <li>💚 <strong>Second Chance</strong> — survive one bust</li>
              <li>+2, +4, ×2 — score modifiers</li>
            </ul>
            <p>First to <strong>{settings.targetScore} points</strong> wins!</p>
          </div>
          <button
            onClick={() => setShowRules(false)}
            className="w-full py-3.5 bg-(--game-accent) text-black rounded-xl font-semibold active:scale-[0.97] transition-all"
          >
            Let&apos;s Go! 🃏
          </button>
        </div>
      </div>
    );
  }

  // Game Over
  if (phase === 'finished') {
    return (
      <div data-game="flip-7">
        {lastFlipEvent && (
          <FlipAnimation card={lastFlipEvent.card} result={lastFlipEvent.result} playerName={lastFlipEvent.playerName} isMe={lastFlipEvent.playerId === playerId} />
        )}
        <GameOver
          players={players}
          winnerId={winnerId}
          roundScores={roundScores}
          myId={playerId || ''}
          isHost={isHost}
          onRematch={rematch}
          onBackToLobby={endGame}
          onLeaveRoom={leaveRoom}
        />
      </div>
    );
  }

  // Round Summary
  if (phase === 'roundEnd') {
    return (
      <div data-game="flip-7">
        {lastFlipEvent && (
          <FlipAnimation card={lastFlipEvent.card} result={lastFlipEvent.result} playerName={lastFlipEvent.playerName} isMe={lastFlipEvent.playerId === playerId} />
        )}
        <RoundSummary
          players={players}
          roundScores={roundScores}
          round={round}
          flipSevenBy={flipSevenAchievedBy}
          winnerId={winnerId}
          isHost={isHost}
          onNextRound={nextRound}
          onEndGame={handleEndGame}
          endGameConfirm={endGameConfirm}
        />
      </div>
    );
  }

  // Dealing phase
  if (phase === 'dealing') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" data-game="flip-7">
        <div className="animate-soft-pulse text-center">
          <p className="text-4xl mb-3">🃏</p>
          <p className="text-sm text-(--text-secondary)">Dealing cards...</p>
        </div>
      </div>
    );
  }

  // Determine HIT button danger level
  const cardCount = myCards.length;
  const hitDangerClass = cardCount >= 6
    ? 'bg-(--danger) text-white'
    : cardCount >= 4
      ? 'bg-gradient-to-r from-(--game-accent) to-(--danger) text-black'
      : 'bg-(--game-accent) text-black';

  // Playing phase — main game UI
  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full" data-game="flip-7">
      {/* Reconnecting banner */}
      {!connected && (
        <div className="bg-(--danger)/20 text-(--danger) text-xs text-center py-1.5 px-3">
          Reconnecting...
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🃏</span>
          <div>
            <h1 className="text-sm font-bold text-(--text-primary) leading-tight">Flip 7</h1>
            <p className="text-[10px] text-(--text-muted)">Round {round} · Deck: {deckRemaining}</p>
          </div>
        </div>

        {/* Turn timer */}
        {turnTimer !== null && (
          <div className={`text-lg font-mono font-bold px-3 py-1 rounded-full ${
            turnTimer <= 5 ? 'text-(--danger) bg-(--danger)/10 animate-timer-urgent' : 'text-(--text-secondary) bg-(--bg-card)'
          }`}>
            {turnTimer}s
          </div>
        )}

        {/* My score */}
        <div className="text-right">
          <p className="text-xs text-(--text-muted)">Score</p>
          <p className="text-sm font-bold text-(--text-primary)">{myPlayer?.cumulativeScore || 0}</p>
        </div>
      </div>

      {/* Player status row */}
      <div className="px-2 py-1">
        <PlayerStatus
          players={players}
          activePlayerId={activePlayerId}
          myId={playerId || ''}
        />
      </div>

      {/* Turn indicator */}
      <div className="text-center py-2">
        {settings.mode === 'classic' && (
          isMyTurn ? (
            <p className="text-sm font-semibold text-(--game-accent)">Your turn — Hit or Stay?</p>
          ) : activePlayer ? (
            <p className="text-xs text-(--text-muted)">
              {activePlayer.avatar} {activePlayer.name}&apos;s turn...
            </p>
          ) : null
        )}
        {settings.mode === 'chaos' && myRoundStatus === 'active' && (
          <p className="text-sm font-semibold text-(--game-accent)">Choose: Hit or Stay?</p>
        )}
      </div>

      {/* Activity log (when not my turn) */}
      {!isMyTurn && settings.mode === 'classic' && activityLog.length > 0 && (
        <div className="mx-4 mb-2 max-h-24 overflow-y-auto bg-(--bg-card) border border-(--border) rounded-xl p-3 space-y-1.5">
          {activityLog.slice(-6).map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="font-semibold text-(--text-primary) shrink-0">{entry.playerName}</span>
              {entry.result === 'safe' && entry.card.type === 'number' && (
                <span className="text-(--text-secondary)">
                  drew <span className="font-bold text-(--game-accent)">{entry.card.value}</span> ✓
                </span>
              )}
              {entry.result === 'bust' && (
                <span className="text-(--danger) font-semibold">busted! 💀</span>
              )}
              {entry.result === 'secondChance' && (
                <span className="text-green-400 font-semibold">saved by Second Chance! 💚</span>
              )}
              {entry.result === 'stayed' && (
                <span className="text-(--text-muted)">stayed ✓</span>
              )}
              {entry.result === 'frozen' && (
                <span className="text-blue-400">was frozen ❄️</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card display */}
      <div className="flex-1 px-4 flex flex-col justify-center min-h-[200px]">
        <CardDisplay
          cards={myCards}
          modifiers={myModifiers}
          secondChances={mySecondChances}
          roundStatus={myRoundStatus}
        />
      </div>

      {/* Flip animation overlay — shows on top of everything including phase transitions */}
      {lastFlipEvent && (
        <FlipAnimation
          card={lastFlipEvent.card}
          result={lastFlipEvent.result}
          playerName={lastFlipEvent.playerName}
          isMe={lastFlipEvent.playerId === playerId}
        />
      )}

      {/* Action sheet */}
      {pendingAction && pendingAction.eligibleTargets.length > 0 && (
        <ActionSheet
          type="action"
          cardKind={pendingAction.cardKind}
          eligibleTargets={pendingAction.eligibleTargets}
          players={players}
          onSelect={useAction}
          turnTimer={turnTimer}
        />
      )}
      {pendingModifier && pendingModifier.eligibleTargets.length > 0 && (
        <ActionSheet
          type="modifier"
          cardKind={pendingModifier.cardKind}
          eligibleTargets={pendingModifier.eligibleTargets}
          players={players}
          onSelect={(targetId) => giveModifier(targetId)}
          onKeep={() => giveModifier(null)}
          turnTimer={turnTimer}
        />
      )}

      {/* HIT / STAY buttons */}
      {(isMyTurn || (settings.mode === 'chaos' && myRoundStatus === 'active' && !chaosSubmitted)) && !pendingAction && !pendingModifier && (
        <div className="px-4 pb-4 pt-2 flex gap-3">
          <button
            onClick={settings.mode === 'chaos' ? () => chaosChoice('stay') : stay}
            className="flex-1 py-4 rounded-xl font-semibold text-sm bg-(--bg-card) border border-(--border) text-(--text-secondary) active:scale-[0.97] transition-all"
          >
            🛡️ STAY
          </button>
          <button
            onClick={settings.mode === 'chaos' ? () => chaosChoice('hit') : hit}
            className={`flex-1 py-4 rounded-xl font-semibold text-sm active:scale-[0.97] transition-all ${hitDangerClass}`}
          >
            🃏 HIT
          </button>
        </div>
      )}

      {/* Chaos mode: waiting for others */}
      {settings.mode === 'chaos' && myRoundStatus === 'active' && chaosSubmitted && (
        <div className="text-center py-4 px-4">
          <p className="text-sm text-(--text-muted) animate-soft-pulse">⏳ Waiting for others...</p>
        </div>
      )}

      {/* Busted/stayed message */}
      {myRoundStatus === 'busted' && (
        <div className="text-center py-4 px-4">
          <p className="text-sm text-(--text-muted)">💀 You busted — waiting for round to end</p>
        </div>
      )}
      {(myRoundStatus === 'stayed' || myRoundStatus === 'frozen') && (
        <div className="text-center py-4 px-4">
          <p className="text-sm text-(--text-muted)">
            {myRoundStatus === 'frozen' ? '❄️ You were frozen' : '✓ You stayed'} — watching others
          </p>
        </div>
      )}

      {/* Host end game button */}
      {isHost && (
        <div className="px-4 pb-4">
          <button
            onClick={handleEndGame}
            className={`w-full py-2.5 rounded-xl text-xs transition-all ${
              endGameConfirm
                ? 'bg-(--danger) text-white'
                : 'text-(--text-muted) border border-(--border)'
            }`}
          >
            {endGameConfirm ? 'Tap again to end game' : 'End Game'}
          </button>
        </div>
      )}
    </div>
  );
}
