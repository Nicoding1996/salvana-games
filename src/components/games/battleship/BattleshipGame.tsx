'use client';

import { useCallback, useState } from 'react';
import type { useRoom } from '@/lib/hub/useRoom';
import { useBattleship } from '@/lib/games/battleship/useBattleship';
import type { BattleshipSettings } from '@/types/games/battleship';
import { BATTLESHIP_MAX_PLAYERS, BATTLESHIP_MIN_PLAYERS } from '@/types/games/battleship';
import RulesSheet from '@/components/shared/RulesSheet';
import EndGameButton from '@/components/shared/EndGameButton';
import ShipPlacement from './ShipPlacement';
import AttackGrid from './AttackGrid';
import GameOver from './GameOver';

interface BattleshipGameProps {
  roomHook: ReturnType<typeof useRoom>;
}

// The first-game quick rules are shown once per page load.
let quickRulesSeen = false;

function QuickRules({ settings, onClose }: { settings: BattleshipSettings; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="bs-quick-rules">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div className="battleship-card relative w-full max-w-lg rounded-t-3xl px-5 pt-5 bs-safe-bottom bs-sheet-up">
        <h2 id="bs-quick-rules" className="text-center text-lg font-bold text-(--text-primary)">⚓ How Battleship works</h2>
        <ul className="mt-4 space-y-3 text-sm text-(--text-secondary)">
          <li className="flex gap-3">
            <span className="w-8 shrink-0 text-center text-xl" aria-hidden="true">🚢</span>
            <span>Hide your 4 ships on your grid. Tap a ship, then a square. Tap a placed ship to move it, tap again to turn it, or hit Shuffle.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-8 shrink-0 text-center text-xl" aria-hidden="true">🎯</span>
            <span>
              On your turn, tap squares on an opponent&apos;s grid to fire.{' '}
              {settings.shotMode === 'salvo'
                ? <>In <strong className="text-(--game-accent)">Salvo</strong> you get one shot per ship still afloat.</>
                : <>You get <strong className="text-(--text-primary)">1 shot</strong> per turn.</>}
            </span>
          </li>
          <li className="flex gap-3">
            <span className="w-8 shrink-0 text-center text-xl" aria-hidden="true">💥</span>
            <span>Hit: fire on the square. Miss: a grey dot. Hit every square of a ship to sink it.</span>
          </li>
          {settings.sonarPing && (
            <li className="flex gap-3">
              <span className="w-8 shrink-0 text-center text-xl" aria-hidden="true">📡</span>
              <span>Once per game, a sonar ping tells you if a 2×2 area hides a ship. Only you see the answer.</span>
            </li>
          )}
          <li className="flex gap-3">
            <span className="w-8 shrink-0 text-center text-xl" aria-hidden="true">🏆</span>
            <span>Lose all your ships and you&apos;re out. Last fleet afloat wins.</span>
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97]"
        >
          Deploy my fleet
        </button>
      </div>
    </div>
  );
}

export default function BattleshipGame({ roomHook }: BattleshipGameProps) {
  const { playerId, isHost, leaveRoom, room } = roomHook;
  const myId = playerId ?? '';
  const game = useBattleship();
  const { state, timer, lastShot, pending, notice } = game;
  const [showRules, setShowRules] = useState(false);
  const [showQuickRules, setShowQuickRules] = useState(() => !quickRulesSeen);
  const closeRules = useCallback(() => setShowRules(false), []);

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center" data-game="battleship">
        <p className="text-sm text-(--text-secondary) animate-soft-pulse">⚓ Charting the waters…</p>
      </div>
    );
  }

  const hostName = room ? room.players[room.hostId]?.name ?? 'the host' : 'the host';

  if (state.phase === 'finished') {
    const online = room ? Object.values(room.players).filter(p => p.connected).length : 0;
    return (
      <div data-game="battleship" className="flex flex-1 flex-col">
        <GameOver
          players={state.players}
          eliminationOrder={state.eliminationOrder}
          winnerId={state.winnerId}
          turns={state.turnNumber}
          myId={myId}
          isHost={isHost}
          hostName={hostName}
          canRematch={online >= BATTLESHIP_MIN_PLAYERS && online <= BATTLESHIP_MAX_PLAYERS}
          onRematch={game.rematch}
          onBackToLobby={game.endGame}
          onLeaveRoom={leaveRoom}
        />
      </div>
    );
  }

  const { settings } = state;
  const modeLabel = settings.shotMode === 'salvo' ? 'Salvo' : 'Classic';

  return (
    <div data-game="battleship" className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bs-table">
      <header className="flex items-center gap-2 px-4 pb-2 pt-3">
        <span className="text-xl" aria-hidden="true">⚓</span>
        <div className="min-w-0">
          <h1 className="text-sm font-bold leading-tight text-(--text-primary)">Battleship</h1>
          <p className="truncate text-[11px] text-(--text-muted)">
            {state.phase === 'placement' ? 'Placing fleets' : `Turn ${state.turnNumber}`} · {settings.gridSize}×{settings.gridSize} · {modeLabel}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowRules(true)}
            aria-label="How to play"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-(--border) bg-(--bg-card) text-sm font-bold text-(--text-secondary) active:scale-95"
          >
            ?
          </button>
          {isHost && <EndGameButton onConfirm={game.endGame} />}
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {state.phase === 'placement' ? (
          <ShipPlacement state={state} myId={myId} timer={timer} sending={pending === 'fleet'} onDeploy={game.placeShips} />
        ) : (
          <AttackGrid
            state={state}
            myId={myId}
            timer={timer}
            lastShot={lastShot}
            pending={pending}
            onFire={game.fire}
            onSonar={game.sonarPing}
          />
        )}
      </main>

      {notice && (
        <div
          key={notice.id}
          role="alert"
          className="fixed left-1/2 top-16 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-(--danger)/40 bg-(--bg-elevated) px-4 py-2 text-center text-sm text-(--text-primary) shadow-lg animate-slide-up"
        >
          {notice.text}
        </div>
      )}

      {showQuickRules && state.phase === 'placement' && state.inGame && (
        <QuickRules
          settings={settings}
          onClose={() => {
            quickRulesSeen = true;
            setShowQuickRules(false);
          }}
        />
      )}
      {showRules && <RulesSheet gameId="battleship" onClose={closeRules} />}
    </div>
  );
}
