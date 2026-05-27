'use client';

import { useState } from 'react';
import { useFlip7 } from '@/lib/games/flip7/useFlip7';
import type { useRoom } from '@/lib/hub/useRoom';
import FlipAnimation from './FlipAnimation';
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
    actionNotification,
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

      {/* Action notification toast */}
      {actionNotification && (
        <div className={`mx-4 mb-2 p-3 rounded-xl border text-center animate-slide-up ${
          actionNotification.type === 'freeze'
            ? 'bg-blue-500/10 border-blue-500/30'
            : 'bg-yellow-500/10 border-yellow-500/30'
        }`}>
          {actionNotification.type === 'freeze' ? (
            <p className="text-sm font-semibold text-blue-400">
              ❄️ {actionNotification.targetId === playerId
                ? `${actionNotification.byName} froze you!`
                : `${actionNotification.byName} froze ${actionNotification.targetName}!`
              }
            </p>
          ) : (
            <p className="text-sm font-semibold text-yellow-400">
              ⚡ {actionNotification.targetId === playerId
                ? `${actionNotification.byName} forced you to draw 3!`
                : `${actionNotification.byName} forced ${actionNotification.targetName} to draw 3!`
              }
            </p>
          )}
        </div>
      )}

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

      {/* All players' hands — scrollable */}
      <div className="flex-1 overflow-y-auto px-3 space-y-2 pb-2">
        {/* Your hand (highlighted) */}
        <div className={`rounded-xl border-2 p-3 ${
          isMyTurn ? 'border-(--game-accent) bg-(--game-accent)/5' : 'border-(--border-light) bg-(--bg-card)'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">{myPlayer?.avatar}</span>
              <span className="text-xs font-semibold text-(--text-primary)">You</span>
              {myRoundStatus === 'busted' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-(--danger)/20 text-(--danger) font-bold">BUST</span>}
              {myRoundStatus === 'stayed' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-(--text-muted)/20 text-(--text-muted) font-bold">STAYED</span>}
              {myRoundStatus === 'frozen' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">FROZEN</span>}
            </div>
            <span className="text-xs font-bold text-(--game-accent)">
              +{(() => {
                if (myRoundStatus === 'busted') return 0;
                let base = myCards.reduce((s, c) => s + c.value, 0);
                const times2 = myModifiers.filter(m => m === 'times2').length;
                base *= Math.pow(2, times2);
                base += myModifiers.reduce((s, m) => m === 'plus2' ? s + 2 : m === 'plus4' ? s + 4 : s, 0);
                return base;
              })()} this round
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {/* Number cards first (sorted by value) */}
            {[...myCards].sort((a, b) => a.value - b.value).map((card, i) => {
              const val = card.value;
              return (
                <div key={i} className="w-11 h-14 rounded-lg flex flex-col items-center justify-center shadow-sm" style={{
                  backgroundColor: val <= 2 ? '#fef3c7' : val <= 5 ? '#ecfdf5' : val <= 8 ? '#eff6ff' : val <= 10 ? '#f5f3ff' : '#fdf2f8',
                  border: `1.5px solid ${val <= 2 ? '#f59e0b' : val <= 5 ? '#10b981' : val <= 8 ? '#3b82f6' : val <= 10 ? '#8b5cf6' : '#ec4899'}`,
                }}>
                  <span className="text-base font-bold" style={{ color: val <= 2 ? '#92400e' : val <= 5 ? '#065f46' : val <= 8 ? '#1e40af' : val <= 10 ? '#5b21b6' : '#9d174d' }}>{val}</span>
                  <span className="text-[7px]" style={{ color: val <= 2 ? '#f59e0b' : val <= 5 ? '#10b981' : val <= 8 ? '#3b82f6' : val <= 10 ? '#8b5cf6' : '#ec4899' }}>pts</span>
                </div>
              );
            })}
            {/* Show bust card with red highlight */}
            {myRoundStatus === 'busted' && myPlayer?.bustCard !== null && myPlayer?.bustCard !== undefined && (
              <div className="w-11 h-14 rounded-lg flex flex-col items-center justify-center shadow-sm bg-red-100 border-2 border-red-500">
                <span className="text-base font-bold text-red-600">{myPlayer.bustCard}</span>
                <span className="text-[7px] text-red-400">💀</span>
              </div>
            )}
            {myModifiers.map((mod, i) => (
              <div key={`m${i}`} className="w-11 h-14 rounded-lg flex items-center justify-center shadow-sm bg-(--bg-elevated) border border-(--game-accent)/40">
                <span className="text-sm font-bold text-(--game-accent)">{mod === 'plus2' ? '+2' : mod === 'plus4' ? '+4' : '×2'}</span>
              </div>
            ))}
            {mySecondChances > 0 && (
              <div className="w-11 h-14 rounded-lg flex items-center justify-center shadow-sm bg-(--bg-elevated) border border-green-500/40">
                <span className="text-sm">💚</span>
              </div>
            )}
            {myCards.length === 0 && myRoundStatus === 'active' && (
              <span className="text-[10px] text-(--text-muted) py-2">Waiting for cards...</span>
            )}
          </div>
        </div>

        {/* Other players' hands */}
        {players.filter(p => p.id !== playerId).map(p => {
          const isActive = p.id === activePlayerId;
          return (
            <div key={p.id} className={`rounded-xl border p-3 ${
              isActive ? 'border-(--game-accent)/50 bg-(--game-accent)/5' : 'border-(--border) bg-(--bg-card)/50'
            } ${p.roundStatus === 'busted' ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{p.avatar}</span>
                  <span className="text-xs font-semibold text-(--text-primary)">{p.name}</span>
                  {p.roundStatus === 'busted' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-(--danger)/20 text-(--danger) font-bold">BUST</span>}
                  {p.roundStatus === 'stayed' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-(--text-muted)/20 text-(--text-muted) font-bold">STAYED</span>}
                  {p.roundStatus === 'frozen' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">FROZEN</span>}
                </div>
                <span className="text-[10px] font-semibold text-(--text-secondary)">
                  +{(() => {
                    if (p.roundStatus === 'busted') return 0;
                    let base = (p.visibleCards || []).reduce((s: number, v: number) => s + v, 0);
                    const times2 = (p.modifiers || []).filter((m: string) => m === 'times2').length;
                    base *= Math.pow(2, times2);
                    base += (p.modifiers || []).reduce((s: number, m: string) => m === 'plus2' ? s + 2 : m === 'plus4' ? s + 4 : s, 0);
                    return base;
                  })()} this round
                  <span className="text-(--text-muted) ml-1">{p.cumulativeScore} pts</span>
                </span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {/* Number cards sorted by value */}
                {[...(p.visibleCards || [])].sort((a, b) => a - b).map((val, i) => (
                  <div key={i} className="w-9 h-12 rounded-md flex flex-col items-center justify-center" style={{
                    backgroundColor: val <= 2 ? '#fef3c7' : val <= 5 ? '#ecfdf5' : val <= 8 ? '#eff6ff' : val <= 10 ? '#f5f3ff' : '#fdf2f8',
                    border: `1px solid ${val <= 2 ? '#f59e0b' : val <= 5 ? '#10b981' : val <= 8 ? '#3b82f6' : val <= 10 ? '#8b5cf6' : '#ec4899'}`,
                  }}>
                    <span className="text-sm font-bold" style={{ color: val <= 2 ? '#92400e' : val <= 5 ? '#065f46' : val <= 8 ? '#1e40af' : val <= 10 ? '#5b21b6' : '#9d174d' }}>{val}</span>
                    <span className="text-[6px]" style={{ color: val <= 2 ? '#f59e0b' : val <= 5 ? '#10b981' : val <= 8 ? '#3b82f6' : val <= 10 ? '#8b5cf6' : '#ec4899' }}>pts</span>
                  </div>
                ))}
                {/* Show bust card with red highlight */}
                {p.roundStatus === 'busted' && p.bustCard !== null && p.bustCard !== undefined && (
                  <div className="w-9 h-12 rounded-md flex flex-col items-center justify-center bg-red-100 border-2 border-red-500">
                    <span className="text-sm font-bold text-red-600">{p.bustCard}</span>
                    <span className="text-[6px] text-red-400">💀</span>
                  </div>
                )}
                {(p.modifiers || []).map((mod, i) => (
                  <div key={`m${i}`} className="w-9 h-12 rounded-md flex items-center justify-center bg-(--bg-elevated) border border-(--game-accent)/30">
                    <span className="text-[10px] font-bold text-(--game-accent)">{mod === 'plus2' ? '+2' : mod === 'plus4' ? '+4' : '×2'}</span>
                  </div>
                ))}
                {(p.visibleCards?.length ?? 0) === 0 && p.roundStatus === 'active' && (
                  <span className="text-[9px] text-(--text-muted) py-1">No cards yet</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Flip animation overlay — shows on top of everything (but not during pending actions) */}
      {lastFlipEvent && !pendingAction && (
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
