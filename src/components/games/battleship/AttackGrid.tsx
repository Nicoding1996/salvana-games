'use client';

import { useState } from 'react';
import type {
  BattleshipClientState,
  BattleshipTimer,
  BattleshipTurnRecap,
  CellState,
  Coordinate,
  ShotEntry,
} from '@/types/games/battleship';
import { SHIPS, cellName, clampSonar } from '@/types/games/battleship';
import type { BattleshipShotFx } from '@/lib/games/battleship/useBattleship';
import TimerBar from '@/components/shared/TimerBar';
import Board, { fitCellSize, useViewportWidth } from './Board';
import FleetStatus, { ShipPips } from './FleetStatus';

interface AttackGridProps {
  state: BattleshipClientState;
  myId: string;
  timer: BattleshipTimer | null;
  lastShot: BattleshipShotFx | null;
  pending: string | null;
  onFire: (targetId: string, coordinate: Coordinate) => void;
  onSonar: (targetId: string, topLeft: Coordinate) => void;
}

interface FeedLine {
  text: string;
  tone: 'muted' | 'good' | 'bad' | 'accent';
}

const TONE_CLASS: Record<FeedLine['tone'], string> = {
  muted: 'border-(--border) bg-(--bg-card) text-(--text-secondary)',
  good: 'border-(--game-accent)/30 bg-(--game-accent-dim) text-(--game-accent)',
  bad: 'border-(--danger)/30 bg-(--danger-dim) text-(--danger)',
  accent: 'border-(--success)/30 bg-(--success-dim) text-(--success)',
};

function shipNameAt(state: BattleshipClientState, c: Coordinate): string | null {
  const id = state.myShipMap[c.row]?.[c.col];
  return SHIPS.find(s => s.id === id)?.name ?? null;
}

function describeShot(shot: ShotEntry, state: BattleshipClientState, myId: string): FeedLine {
  const where = cellName(shot.coordinate);
  const auto = shot.auto ? '⏱️ ' : '';
  if (shot.playerId === myId) {
    if (shot.result === 'sunk') return { text: `${auto}🔥 You sunk ${shot.targetName}'s ${shot.sunkShipName}!`, tone: 'accent' };
    if (shot.result === 'hit') return { text: `${auto}💥 Hit at ${where}! Keep going`, tone: 'good' };
    return { text: `${auto}💧 Miss at ${where}`, tone: 'muted' };
  }
  if (shot.targetId === myId) {
    const ship = shipNameAt(state, shot.coordinate) ?? 'ship';
    if (shot.result === 'sunk') return { text: `${auto}🔥 ${shot.playerName} sunk your ${shot.sunkShipName}!`, tone: 'bad' };
    if (shot.result === 'hit') return { text: `${auto}💥 ${shot.playerName} hit your ${ship} at ${where}`, tone: 'bad' };
    return { text: `${auto}💧 ${shot.playerName} missed you at ${where}`, tone: 'muted' };
  }
  if (shot.result === 'sunk') return { text: `${auto}🔥 ${shot.playerName} sunk ${shot.targetName}'s ${shot.sunkShipName}`, tone: 'good' };
  if (shot.result === 'hit') return { text: `${auto}💥 ${shot.playerName} hit ${shot.targetName} at ${where}`, tone: 'good' };
  return { text: `${auto}💧 ${shot.playerName} missed ${shot.targetName} at ${where}`, tone: 'muted' };
}

function describeTurn(turn: BattleshipTurnRecap, myId: string): FeedLine | null {
  const n = turn.shots.length;
  if (n === 0) return null;
  const by = turn.playerId === myId ? 'You' : turn.playerName;
  const hits = turn.shots.filter(s => s.result !== 'miss').length;
  const sunk = turn.shots.filter(s => s.result === 'sunk')
    .map(s => `${s.targetId === myId ? 'your' : `${s.targetName}'s`} ${s.sunkShipName}`);
  const hitMe = turn.playerId !== myId && turn.shots.some(s => s.targetId === myId && s.result !== 'miss');
  let text = `Last turn: ${by} fired ${n} · ${hits === 0 ? 'all missed' : `${hits} hit${hits === 1 ? '' : 's'}`}`;
  if (sunk.length) text += ` · sank ${sunk.join(', ')}`;
  return { text, tone: hitMe ? 'bad' : hits > 0 ? 'good' : 'muted' };
}

export default function AttackGrid({ state, myId, timer, lastShot, pending, onFire, onSonar }: AttackGridProps) {
  const width = useViewportWidth();
  const [chosenTarget, setChosenTarget] = useState<string | null>(null);
  const [manualView, setManualView] = useState<{ turn: number; id: string } | null>(null);
  const [sonarMode, setSonarMode] = useState(false);

  // Sonar aiming ends with the turn (adjusting state while rendering)
  const [prevTurn, setPrevTurn] = useState(state.turnNumber);
  if (state.turnNumber !== prevTurn) {
    setPrevTurn(state.turnNumber);
    setSonarMode(false);
  }

  const me = state.players.find(p => p.id === myId);
  const aliveOpponents = state.players.filter(p => p.id !== myId && p.alive);
  const target = aliveOpponents.find(p => p.id === chosenTarget)?.id ?? aliveOpponents[0]?.id ?? null;
  const active = state.players.find(p => p.id === state.activePlayerId);
  const watchingOnly = !state.inGame || !me?.alive;

  // What the big board shows: your target on your turn, otherwise wherever the shots are landing
  let viewId: string | null;
  if (manualView && manualView.turn === state.turnNumber && state.players.some(p => p.id === manualView.id)) {
    viewId = manualView.id;
  } else if (state.isMyTurn) {
    viewId = target;
  } else {
    const last = state.turnShots[state.turnShots.length - 1];
    viewId = last?.targetId ?? (state.inGame && me?.alive ? myId : aliveOpponents[0]?.id ?? null);
  }
  const viewingMine = viewId === myId && state.inGame;
  const viewPlayer = state.players.find(p => p.id === viewId);
  const grid: CellState[][] | undefined = viewingMine ? state.myGrid : viewId ? state.attackGrids[viewId] : undefined;

  const firingHere = state.isMyTurn && !viewingMine && !!viewPlayer?.alive && state.shotsRemaining > 0;
  const pendingCell = (() => {
    if (!pending || !viewId || !pending.startsWith(`${viewId}:`)) return null;
    const [row, col] = pending.slice(viewId.length + 1).split(',').map(Number);
    return { row, col };
  })();
  const impact = lastShot && lastShot.shot.targetId === viewId
    ? { key: lastShot.key, result: lastShot.shot.result, ...lastShot.shot.coordinate }
    : null;
  const scan = state.mySonar && state.mySonar.targetId === viewId ? state.mySonar : null;
  const hitOnMe = !!lastShot && lastShot.shot.targetId === myId && lastShot.shot.result !== 'miss' && viewingMine;

  const handleSelect = (id: string) => {
    if (state.isMyTurn && id !== myId && aliveOpponents.some(p => p.id === id)) {
      setChosenTarget(id);
      setManualView(null);
    } else {
      setManualView({ turn: state.turnNumber, id });
    }
  };

  const handleTap = (row: number, col: number) => {
    if (!viewId || !firingHere) return;
    if (sonarMode) {
      onSonar(viewId, clampSonar({ row, col }, state.gridSize));
      setSonarMode(false);
      return;
    }
    onFire(viewId, { row, col });
  };

  // ---- Banner ----
  const myTimer = timer && timer.playerId === myId ? timer : null;
  const activeTimer = timer && timer.playerId && timer.playerId === state.activePlayerId ? timer : null;
  let banner: { text: string; tone: string };
  if (state.isMyTurn) {
    banner = state.shotsRemaining > 0
      ? { text: `🎯 Your turn · ${state.shotsRemaining} shot${state.shotsRemaining === 1 ? '' : 's'} left`, tone: 'var(--game-accent)' }
      : { text: '⏳ Shots away…', tone: 'var(--text-secondary)' };
  } else if (active) {
    const atMe = state.turnShots.some(s => s.targetId === myId);
    banner = { text: `${active.avatar} ${active.name} is firing${atMe ? ' at you!' : '…'}`, tone: atMe ? 'var(--danger)' : 'var(--text-secondary)' };
  } else {
    banner = { text: 'Battle stations…', tone: 'var(--text-secondary)' };
  }

  // ---- Feed ----
  const lastThisTurn = state.turnShots[state.turnShots.length - 1];
  const feed: FeedLine | null = lastThisTurn
    ? describeShot(lastThisTurn, state, myId)
    : state.previousTurn ? describeTurn(state.previousTurn, myId) : null;

  const mainCell = fitCellSize(width - 24, state.gridSize, true);
  const miniCell = fitCellSize(Math.round((width - 24) * 0.4), state.gridSize, false);
  const showSonar = state.settings.sonarPing && !state.sonarUsed && state.isMyTurn && state.shotsRemaining > 0;

  return (
    <div className="flex flex-col gap-2 bs-safe-bottom">
      <FleetStatus
        players={state.players}
        myId={myId}
        activePlayerId={state.activePlayerId}
        selectedId={viewId}
        onSelect={handleSelect}
      />

      {/* Whose turn */}
      <div className="px-4">
        <div
          key={`${state.turnNumber}-${state.isMyTurn}`}
          className="bs-banner-in rounded-xl border px-3 py-2"
          style={{
            borderColor: `color-mix(in srgb, ${banner.tone} 35%, transparent)`,
            background: `color-mix(in srgb, ${banner.tone} 8%, transparent)`,
          }}
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: banner.tone }}>{banner.text}</p>
            {state.isMyTurn && state.shotsThisTurn > 1 && (
              <ShipPips remaining={state.shotsRemaining} total={state.shotsThisTurn} />
            )}
            {activeTimer && (
              <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${activeTimer.secondsLeft <= 5 ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-secondary)'}`}>
                {activeTimer.secondsLeft}s
              </span>
            )}
          </div>
          {activeTimer && activeTimer.total > 0 && (
            <div className="mt-1.5">
              <TimerBar seconds={activeTimer.secondsLeft} total={activeTimer.total} />
            </div>
          )}
          {!state.isMyTurn && active && !active.connected && (
            <p className="mt-1 text-[11px] text-(--text-muted)">{active.name} is away · their shots fire automatically</p>
          )}
          {myTimer && myTimer.secondsLeft <= 5 && state.shotsRemaining > 0 && (
            <p className="mt-1 text-[11px] text-(--danger)">Out of time soon: leftover shots fire at random</p>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex flex-col items-center gap-1.5 px-3">
        <p className="w-full px-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-(--text-muted)">
          {viewingMine
            ? '🛡️ Your fleet'
            : viewPlayer
              ? `${firingHere ? (sonarMode ? '📡 Scan' : '🎯 Fire at') : '🌊'} ${viewPlayer.name}'s waters`
              : 'Waters'}
          {firingHere && !sonarMode && <span className="normal-case tracking-normal text-(--text-secondary)"> · tap a square</span>}
          {sonarMode && <span className="normal-case tracking-normal text-(--success)"> · tap the top-left of a 2×2 area</span>}
        </p>
        {grid ? (
          <div key={hitOnMe ? `shake-${lastShot?.key}` : 'board'} className={`relative ${hitOnMe ? 'animate-screen-shake' : ''}`}>
            <Board
              grid={grid}
              shipMap={viewingMine ? state.myShipMap : undefined}
              cellSize={mainCell}
              labels
              live={firingHere && !sonarMode}
              sonarMode={sonarMode}
              ariaLabel={viewingMine ? 'Your fleet' : `${viewPlayer?.name ?? 'Opponent'}'s waters`}
              onTap={firingHere ? handleTap : undefined}
              canTap={(r, c) => !pending && (sonarMode || grid[r][c] === 'empty')}
              pending={pendingCell}
              impact={impact}
              scan={scan}
            />
            {hitOnMe && (
              <span className="pointer-events-none absolute inset-0 rounded-[14px] bg-(--danger)/25 animate-flash" aria-hidden="true" />
            )}
          </div>
        ) : (
          <p className="py-10 text-sm text-(--text-muted)">Nothing to show</p>
        )}
      </div>

      {/* What just happened */}
      <div className="min-h-9 px-4" role="status" aria-live="polite">
        {feed && (
          <p key={feed.text} className={`truncate rounded-xl border px-3 py-1.5 text-center text-xs font-semibold animate-fade-in ${TONE_CLASS[feed.tone]}`}>
            {feed.text}
          </p>
        )}
      </div>

      {/* Your fleet (small) + tools */}
      <div className="flex items-start gap-3 px-4">
        {state.inGame && !viewingMine && (
          <button
            type="button"
            onClick={() => setManualView({ turn: state.turnNumber, id: myId })}
            className="shrink-0 rounded-xl text-left active:scale-[0.98]"
            aria-label="Show your fleet"
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-(--text-muted)">Your fleet</p>
            <Board
              grid={state.myGrid}
              shipMap={state.myShipMap}
              cellSize={miniCell}
              ariaLabel="Your fleet (small)"
              impact={lastShot && lastShot.shot.targetId === myId ? { key: lastShot.key, result: lastShot.shot.result, ...lastShot.shot.coordinate } : null}
            />
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-4">
          {showSonar && (
            <button
              type="button"
              onClick={() => setSonarMode(m => !m)}
              className={`min-h-11 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                sonarMode
                  ? 'border-(--success)/50 bg-(--success-dim) text-(--success)'
                  : 'border-(--border-light) bg-(--bg-card) text-(--text-secondary)'
              }`}
            >
              {sonarMode ? '📡 Cancel sonar' : '📡 Sonar ping (once)'}
            </button>
          )}
          {state.mySonar && (
            <p className="text-[11px] leading-snug text-(--text-secondary)">
              📡 Your scan of {state.players.find(p => p.id === state.mySonar?.targetId)?.name ?? 'a fleet'}:{' '}
              <span className={state.mySonar.hasShip ? 'font-semibold text-(--success)' : 'text-(--text-muted)'}>
                {state.mySonar.hasShip ? 'ship in that area!' : 'empty'}
              </span>
            </p>
          )}
          {state.isMyTurn && !watchingOnly && state.settings.shotMode === 'salvo' && (
            <p className="text-[11px] leading-snug text-(--text-muted)">Salvo: one shot per ship you still have afloat.</p>
          )}
          {watchingOnly && (
            <p className="text-xs text-(--text-secondary)">
              {state.inGame ? '☠️ Your fleet was sunk. Watching the battle.' : '👀 Watching this game.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
