'use client';

import { useState } from 'react';
import { useBattleship } from '@/lib/games/battleship/useBattleship';
import type { useRoom } from '@/lib/hub/useRoom';
import ShipPlacement from './ShipPlacement';
import AttackGrid from './AttackGrid';
import FleetStatus from './FleetStatus';
import GameOver from './GameOver';

interface BattleshipGameProps {
  roomHook: ReturnType<typeof useRoom>;
}

export default function BattleshipGame({ roomHook }: BattleshipGameProps) {
  const { playerId, isHost, connected, leaveRoom } = roomHook;
  const pid = playerId || '';
  const {
    gameState,
    turnTimer,
    placementTimer,
    shotResult,
    placeShips,
    autoPlace,
    fire,
    endTurn,
    useSonar,
    endGame,
    rematch,
  } = useBattleship();

  const [showRules, setShowRules] = useState(gameState.isFirstRound);
  const [endGameConfirm, setEndGameConfirm] = useState(false);

  const { phase, players, isMyTurn, activePlayerId, shotsRemaining, settings, roundNumber } = gameState;

  const activePlayer = players.find(p => p.id === activePlayerId);
  const myPlayer = players.find(p => p.id === pid);
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
    endGame();
  };

  // Rules overlay
  if (showRules && gameState.isFirstRound && phase === 'placement') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto animate-fade-in" data-game="battleship">
        <div className="bg-(--bg-card) border border-(--border) rounded-2xl p-6 space-y-4">
          <h2 className="text-xl font-bold text-(--text-primary) text-center">⚓ How to Play</h2>
          <div className="space-y-3 text-sm text-(--text-secondary)">
            <p>Place your fleet of 4 ships on your grid. Your opponents do the same — secretly.</p>
            <p>Take turns firing at your opponents&apos; grids. Tap a cell to fire.</p>
            {settings.shotMode === 'salvo' ? (
              <p>In <strong className="text-(--game-accent)">Salvo mode</strong>, you get shots equal to your surviving ships. As ships sink, you fire fewer shots.</p>
            ) : (
              <p>In <strong>Classic mode</strong>, you fire 1 shot per turn.</p>
            )}
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><span className="text-(--text-muted)">💧</span> Miss — splash, nothing there</li>
              <li><span className="text-(--danger)">💥</span> Hit — you struck a ship!</li>
              <li><span className="text-(--game-accent)">🔥</span> Sunk — entire ship destroyed!</li>
            </ul>
            {settings.sonarPing && (
              <p>📡 <strong>Sonar Ping</strong> — once per game, scan a 2×2 area to detect if a ship is hiding there.</p>
            )}
            <p>Sink all of an opponent&apos;s ships to eliminate them. Last fleet standing wins!</p>
          </div>
          <button
            onClick={() => setShowRules(false)}
            className="w-full py-3.5 bg-(--game-accent) text-white rounded-xl font-semibold active:scale-[0.97] transition-all"
          >
            Deploy Fleet! ⚓
          </button>
        </div>
      </div>
    );
  }

  // Game Over
  if (phase === 'finished') {
    return (
      <div data-game="battleship">
        <GameOver
          players={players}
          myId={pid}
          isHost={isHost}
          onRematch={rematch}
          onBackToLobby={handleBackToLobby}
          onLeaveRoom={leaveRoom}
        />
      </div>
    );
  }

  // Placement phase
  if (phase === 'placement') {
    return (
      <div className="flex-1 flex flex-col" data-game="battleship">
        {!connected && (
          <div className="bg-(--danger)/20 text-(--danger) text-xs text-center py-1.5 px-3">
            Reconnecting...
          </div>
        )}
        <ShipPlacement
          gridSize={settings.gridSize}
          onPlaceShips={placeShips}
          onAutoPlace={autoPlace}
          placementTimer={placementTimer}
          isReady={myPlayer?.ready || false}
          players={players}
        />
      </div>
    );
  }

  // Battle phase
  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full" data-game="battleship">
      {!connected && (
        <div className="bg-(--danger)/20 text-(--danger) text-xs text-center py-1.5 px-3">
          Reconnecting...
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚓</span>
          <div>
            <h1 className="text-sm font-bold text-(--text-primary) leading-tight">Battleship</h1>
            <p className="text-[10px] text-(--text-muted)">Round {roundNumber}</p>
          </div>
        </div>

        {/* Turn timer */}
        {turnTimer !== null && phase === 'battle' && (
          <div className={`text-lg font-mono font-bold ${
            turnTimer <= 10 ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-secondary)'
          }`}>
            {turnTimer}s
          </div>
        )}

        {/* Shots remaining */}
        {isMyTurn && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-(--text-muted)">Shots:</span>
            <span className="text-sm font-bold text-(--game-accent)">{shotsRemaining}</span>
          </div>
        )}
      </div>

      {/* Turn indicator */}
      {phase === 'battle' && activePlayer && (
        <div className="text-center py-1">
          {isMyTurn ? (
            <p className="text-sm font-semibold text-(--game-accent)">
              Your turn! Fire {shotsRemaining} shot{shotsRemaining !== 1 ? 's' : ''}
            </p>
          ) : (
            <p className="text-xs text-(--text-muted)">
              {activePlayer.avatar} {activePlayer.name}&apos;s turn
            </p>
          )}
        </div>
      )}

      {/* Fleet status bar */}
      <div className="px-4 py-2">
        <FleetStatus players={players} myId={pid} />
      </div>

      {/* Attack grid */}
      <div className="flex-1 px-2">
        <AttackGrid
          gameState={gameState}
          myId={pid}
          onFire={fire}
          onEndTurn={endTurn}
          onUseSonar={useSonar}
          shotResult={shotResult}
        />
      </div>

      {/* Spectator message if eliminated */}
      {!amAlive && (
        <div className="text-center py-4 px-4">
          <p className="text-sm text-(--text-muted)">☠️ Your fleet is destroyed — watching the battle</p>
        </div>
      )}

      {/* Host controls */}
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
