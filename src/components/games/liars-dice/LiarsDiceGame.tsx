'use client';

import { useState } from 'react';
import { useLiarsDice } from '@/lib/games/liars-dice/useLiarsDice';
import type { useRoom } from '@/lib/hub/useRoom';
import PlayerRing from './PlayerRing';
import DiceDisplay from './DiceDisplay';
import BidGrid from './BidGrid';
import BidHistory from './BidHistory';
import RevealPhase from './RevealPhase';
import GameOver from './GameOver';
import { DIE_FACE_LABELS, LIVES_DISPLAY } from '@/types/games/liars-dice';

interface LiarsDiceGameProps {
  roomHook: ReturnType<typeof useRoom>;
}

export default function LiarsDiceGame({ roomHook }: LiarsDiceGameProps) {
  const { playerId, isHost, connected, leaveRoom } = roomHook;
  const {
    gameState,
    myDice,
    turnTimer,
    challengeResult,
    rollComplete,
    placeBid,
    callLiar,
    callSpotOn,
    nextRound,
    endGame,
    rematch,
  } = useLiarsDice();

  const [showRules, setShowRules] = useState(gameState.isFirstRound);
  const [endGameConfirm, setEndGameConfirm] = useState(false);

  const { phase, players, currentBid, activePlayerId, isMyTurn, bidHistory, roundNumber, settings, eliminationOrder, totalDiceOnTable } = gameState;

  const myPlayer = players.find(p => p.id === playerId);
  const activePlayer = players.find(p => p.id === activePlayerId);
  const myLives = myPlayer?.lives || 0;
  const myMaxLives = myPlayer?.maxLives || settings.lives;
  const amAlive = myPlayer?.alive ?? true;

  const handleEndGame = () => {
    if (!endGameConfirm) {
      setEndGameConfirm(true);
      setTimeout(() => setEndGameConfirm(false), 3000);
      return;
    }
    endGame();
  };

  const handleBackToLobby = () => {
    // Reset room to lobby — endGame cleans up game state,
    // then the room phase update will route to Lobby
    endGame();
  };

  // Rules overlay
  if (showRules && gameState.isFirstRound) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto animate-fade-in" data-game="liars-dice">
        <div className="bg-(--bg-card) border border-(--border) rounded-2xl p-6 space-y-4">
          <h2 className="text-xl font-bold text-(--text-primary) text-center">🎲 How to Play</h2>
          <div className="space-y-3 text-sm text-(--text-secondary)">
            <p>Everyone rolls 5 dice secretly. Only you can see yours.</p>
            <p>Take turns bidding on how many of a specific face value exist across <strong>ALL</strong> players&apos; dice combined.</p>
            <p>Each bid must be higher than the last — raise the quantity or the face value.</p>
            <p>Think someone&apos;s bluffing? Call <strong className="text-(--danger)">LIAR!</strong> All dice are revealed.</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Bid was wrong → bidder loses a ❤️</li>
              <li>Bid was right → challenger loses a ❤️</li>
            </ul>
            {settings.spotOn && (
              <p>You can also call <strong className="text-(--game-secondary)">SPOT ON!</strong> if you think the bid is exactly right. Correct = everyone else loses a ❤️. Wrong = you lose one.</p>
            )}
            {settings.wildOnes && (
              <p>⚀ are <strong>wild</strong> — they count as any face value!</p>
            )}
            <p>Lose all your hearts and you&apos;re out. Last player standing wins!</p>
          </div>
          <button
            onClick={() => setShowRules(false)}
            className="w-full py-3.5 bg-(--game-accent) text-white rounded-xl font-semibold active:scale-[0.97] transition-all"
          >
            Got it! 🎲
          </button>
        </div>
      </div>
    );
  }

  // Game Over
  if (phase === 'finished') {
    return (
      <div data-game="liars-dice">
        <GameOver
          players={players}
          eliminationOrder={eliminationOrder}
          myId={playerId}
          isHost={isHost}
          onRematch={rematch}
          onBackToLobby={handleBackToLobby}
          onLeaveRoom={leaveRoom}
        />
      </div>
    );
  }

  // Challenge reveal
  if ((phase === 'challenge' || phase === 'reveal') && challengeResult) {
    return (
      <div className="flex-1 flex flex-col" data-game="liars-dice">
        <RevealPhase
          result={challengeResult}
          players={players}
          myId={playerId}
          settings={settings}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full" data-game="liars-dice">
      {/* Reconnecting banner */}
      {!connected && (
        <div className="bg-(--danger)/20 text-(--danger) text-xs text-center py-1.5 px-3">
          Reconnecting...
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎲</span>
          <div>
            <h1 className="text-sm font-bold text-(--text-primary) leading-tight">Liar&apos;s Dice</h1>
            <p className="text-[10px] text-(--text-muted)">Round {roundNumber}</p>
          </div>
        </div>

        {/* Turn timer */}
        {turnTimer !== null && phase === 'bidding' && (
          <div className={`text-lg font-mono font-bold ${
            turnTimer <= 10 ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-secondary)'
          }`}>
            {turnTimer}s
          </div>
        )}

        {/* My lives */}
        <div className="flex items-center gap-1">
          {Array.from({ length: myMaxLives }, (_, i) => (
            <span key={i} className="text-sm">
              {i < myLives ? LIVES_DISPLAY.full : LIVES_DISPLAY.lost}
            </span>
          ))}
        </div>
      </div>

      {/* Player ring */}
      <div className="px-2 py-2">
        <PlayerRing players={players} activePlayerId={activePlayerId} myId={playerId} totalDiceOnTable={totalDiceOnTable} />
      </div>

      {/* Current bid display with tension */}
      {currentBid && phase === 'bidding' && (
        <div className="mx-4 space-y-2">
          <div className="bg-(--bg-card) border border-(--border) rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-(--text-muted) mb-1">Current Bid</p>
            <p className="text-2xl font-bold text-(--text-primary)">
              {currentBid.quantity} × {DIE_FACE_LABELS[currentBid.faceValue]}
            </p>
            <p className="text-xs text-(--text-secondary)">by {currentBid.playerName}</p>
          </div>

          {/* Tension meter — visible to all players */}
          {!isMyTurn && (
            <div className="px-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-wider text-(--text-muted)">Bid Tension</span>
                <span className="text-[9px] text-(--text-muted)">
                  {currentBid.quantity}/{totalDiceOnTable} dice claimed
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-(--bg-primary) overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(1, currentBid.quantity / totalDiceOnTable) * 100}%`,
                    background: currentBid.quantity / totalDiceOnTable < 0.4
                      ? 'var(--success)'
                      : currentBid.quantity / totalDiceOnTable < 0.7
                        ? 'var(--game-secondary)'
                        : 'var(--danger)',
                    boxShadow: currentBid.quantity / totalDiceOnTable > 0.6
                      ? '0 0 8px rgba(248, 113, 113, 0.5)'
                      : 'none',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Whose turn indicator + timer visible to everyone */}
      {phase === 'bidding' && activePlayer && (
        <div className="text-center py-2">
          {isMyTurn ? (
            <p className="text-sm font-semibold text-(--game-accent)">
              Your turn!
              {turnTimer !== null && turnTimer <= 10 && (
                <span className="text-(--danger) animate-timer-urgent ml-1.5">{turnTimer}s</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-(--text-muted)">
              {activePlayer.avatar} {activePlayer.name}&apos;s turn
              {turnTimer !== null && (
                <span className={`ml-1.5 font-mono font-bold ${
                  turnTimer <= 10 ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-secondary)'
                }`}>
                  {turnTimer}s
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Rolling phase message */}
      {phase === 'rolling' && (
        <div className="text-center py-4">
          <p className="text-sm text-(--text-secondary) animate-soft-pulse">
            🎲 Shake or tap to roll your dice!
          </p>
        </div>
      )}

      {/* Round end message */}
      {phase === 'roundEnd' && (
        <div className="text-center py-4 space-y-2">
          <p className="text-sm text-(--text-secondary)">Round over — next round starting...</p>
        </div>
      )}

      {/* Bid history */}
      {bidHistory.length > 0 && (phase === 'bidding' || phase === 'roundEnd') && (
        <div className="mx-4 mt-2">
          <BidHistory entries={bidHistory} />
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* My dice */}
      <div className="px-4 py-3">
        <DiceDisplay
          dice={myDice}
          phase={phase}
          wildOnes={settings.wildOnes}
          onRollComplete={rollComplete}
          highlightFace={phase === 'bidding' && currentBid ? currentBid.faceValue : null}
        />
      </div>

      {/* Bid grid (only on my turn) */}
      {isMyTurn && amAlive && phase === 'bidding' && (
        <div className="px-4 pb-4">
          <BidGrid
            currentBid={currentBid ? { quantity: currentBid.quantity, faceValue: currentBid.faceValue } : null}
            totalDiceOnTable={totalDiceOnTable}
            onPlaceBid={placeBid}
            onCallLiar={callLiar}
            onCallSpotOn={settings.spotOn ? callSpotOn : undefined}
            spotOnEnabled={settings.spotOn}
            myDice={myDice}
            wildOnes={settings.wildOnes}
          />
        </div>
      )}

      {/* Spectator message if eliminated */}
      {!amAlive && (
        <div className="text-center py-4 px-4">
          <p className="text-sm text-(--text-muted)">☠️ You&apos;re eliminated — watching the action</p>
        </div>
      )}

      {/* Host controls */}
      {isHost && phase === 'bidding' && (
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
