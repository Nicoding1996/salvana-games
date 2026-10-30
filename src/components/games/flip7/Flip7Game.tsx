'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useFlip7 } from '@/lib/games/flip7/useFlip7';
import type { useRoom } from '@/lib/hub/useRoom';
import { ACTION_CARD_LABELS, ACTION_TIMEOUT_MS, computeRoundScore } from '@/types/games/flip7';
import RulesSheet from '@/components/shared/RulesSheet';
import FlipAnimation from './FlipAnimation';
import ActionAnimation from './ActionAnimation';
import ActionSheet from './ActionSheet';
import RoundSummary from './RoundSummary';
import GameOver from './GameOver';
import TimerBar from '@/components/shared/TimerBar';
import { CardBack, DeckPile, NumberCard } from './CardArt';
import { MyHand, OpponentRow } from './PlayerHands';

interface Flip7GameProps {
  roomHook: ReturnType<typeof useRoom>;
}

// The first-round quick rules are shown once per page load.
let quickRulesSeen = false;

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' & ');
  return `${names.slice(0, 2).join(', ')} & ${names.length - 2} more`;
}

const DEAL_FLY = [
  { dx: '-130px', dy: '-150px', rot: '-28deg' },
  { dx: '130px', dy: '-150px', rot: '24deg' },
  { dx: '-160px', dy: '20px', rot: '-14deg' },
  { dx: '160px', dy: '20px', rot: '16deg' },
  { dx: '-100px', dy: '170px', rot: '-8deg' },
  { dx: '100px', dy: '170px', rot: '10deg' },
];

function DealingScreen({ round }: { round: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 f7-table">
      <div className="relative h-[134px] w-[96px]" aria-hidden="true">
        {DEAL_FLY.map((f, i) => (
          <CardBack
            key={i}
            size="lg"
            className="absolute left-0 top-0 f7-deal-card"
            style={{ '--dx': f.dx, '--dy': f.dy, '--rot': f.rot, '--f7-delay': `${i * 150}ms` } as CSSProperties}
          />
        ))}
        <CardBack size="lg" className="absolute left-0 top-0" />
      </div>
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-(--text-muted)">{round === 1 ? 'New game' : 'Next up'}</p>
        <h2 className="mt-1 text-2xl font-bold text-(--text-primary)">Round {round}</h2>
        <p className="mt-1 text-sm text-(--text-secondary) animate-soft-pulse">Shuffling and dealing…</p>
      </div>
    </div>
  );
}

function QuickRules({ targetScore, yourMove, onClose }: { targetScore: number; yourMove: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="f7-quick-rules">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-3xl px-5 pt-5 flip7-card f7-safe-bottom flip7-sheet-up">
        <h2 id="f7-quick-rules" className="text-center text-lg font-bold text-(--text-primary)">🃏 How Flip 7 works</h2>
        <ul className="mt-4 space-y-3 text-sm text-(--text-secondary)">
          <li className="flex items-center gap-3">
            <div className="flex w-[60px] shrink-0 justify-center -space-x-2" aria-hidden="true">
              <NumberCard value={3} size="sm" />
              <NumberCard value={8} size="sm" />
            </div>
            <span>
              On your turn, <strong className="text-(--game-accent)">HIT</strong> to flip a card
              or <strong className="text-(--text-primary)">STAY</strong> to bank your points.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <div className="flex w-[60px] shrink-0 justify-center -space-x-2" aria-hidden="true">
              <NumberCard value={8} size="sm" />
              <NumberCard value={8} size="sm" bust />
            </div>
            <span>Flip a number you already have and you <strong className="text-(--danger)">bust</strong>: 0 points this round.</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-[60px] shrink-0 text-center text-xl" aria-hidden="true">⭐</span>
            <span>Collect 7 different numbers for <strong className="text-(--game-accent)">Flip 7</strong>: +15 and the round ends.</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-[60px] shrink-0 whitespace-nowrap text-center text-sm" aria-hidden="true">❄️⚡💚</span>
            <span>Freeze banks someone, Flip Three makes them flip 3, Second Chance saves one duplicate. +2/+4 add points, ×2 doubles your numbers.</span>
          </li>
        </ul>
        <p className="mt-4 text-center text-xs text-(--text-muted)">First to {targetScore} points wins.</p>
        {yourMove && (
          <p className="mt-2 text-center text-sm font-semibold text-(--game-accent) animate-soft-pulse">It&apos;s your turn!</p>
        )}
        <button
          onClick={onClose}
          className="mt-3 w-full rounded-xl bg-(--game-accent) py-3.5 font-semibold text-(--bg-primary) transition-all active:scale-[0.97]"
        >
          {yourMove ? 'Play my turn' : "Let's go!"}
        </button>
      </div>
    </div>
  );
}

export default function Flip7Game({ roomHook }: Flip7GameProps) {
  const { playerId, isHost, leaveRoom } = roomHook;
  const myId = playerId ?? '';
  const {
    state, display, timer, reveal, revealBusy, toast, myChaosChoice, inputLocked,
    hit, stay, chooseTarget, chaosChoice, nextRound, endGame, rematch,
  } = useFlip7();

  const [showQuickRules, setShowQuickRules] = useState(() => !quickRulesSeen && state.round === 1);
  const [showRules, setShowRules] = useState(false);
  const [endGameConfirm, setEndGameConfirm] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { phase, settings, pendingAction } = state;
  const chaos = settings.mode === 'chaos';
  const me = state.players.find(p => p.id === myId);
  const displayMe = display.players.find(p => p.id === myId);
  const inGame = !!me;
  const myActive = inGame && state.myRoundStatus === 'active';
  const iAmDrawer = pendingAction?.drawerId === myId;
  const iLocked = chaos && state.chaosSubmitted.includes(myId);
  const roundEnding = !!state.flipSevenAchievedBy || !state.players.some(p => p.roundStatus === 'active');

  // Is the table waiting on me right now?
  const yourMove = phase === 'playing' && !roundEnding && (
    pendingAction ? iAmDrawer : chaos ? myActive && !iLocked : state.isMyTurn
  );
  // Buttons stay visible on my move but unlock only after the current reveal, so
  // everyone watches each card and my own flip never queues behind someone else's.
  const showButtons = yourMove && !pendingAction;
  const buttonsDisabled = inputLocked || revealBusy;
  const showSheet = phase === 'playing' && iAmDrawer && !!pendingAction && !revealBusy;
  const readyToPlay = yourMove && !revealBusy;

  // Haptic nudge when it's my move and the table is ready for it
  useEffect(() => {
    if (readyToPlay) navigator.vibrate?.(35);
  }, [readyToPlay]);

  // Haptics for my own big moments
  useEffect(() => {
    if (!reveal) return;
    if (reveal.kind === 'action') {
      if (reveal.action.targetId === myId) navigator.vibrate?.([0, 70, 50, 130]);
      return;
    }
    const mine = reveal.flips.find(f => f.playerId === myId);
    if (mine?.flipSeven) navigator.vibrate?.([0, 60, 40, 60, 40, 160]);
    else if (mine?.result === 'bust') navigator.vibrate?.([0, 120, 60, 220]);
  }, [reveal, myId]);

  // Keep whoever the table is waiting on in view
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [state.activePlayerId, pendingAction?.drawerId]);

  const closeRules = useCallback(() => setShowRules(false), []);
  const closeQuickRules = () => {
    quickRulesSeen = true;
    setShowQuickRules(false);
  };

  const handleEndGame = () => {
    if (!endGameConfirm) {
      setEndGameConfirm(true);
      setTimeout(() => setEndGameConfirm(false), 3000);
      return;
    }
    endGame();
  };

  let body: ReactNode;

  if (phase === 'finished') {
    body = (
      <GameOver
        players={state.players}
        winnerId={state.winnerId}
        roundHistory={state.roundHistory}
        myId={myId}
        isHost={isHost}
        onRematch={rematch}
        onBackToLobby={endGame}
        onLeaveRoom={leaveRoom}
      />
    );
  } else if (phase === 'roundEnd') {
    body = (
      <RoundSummary
        key={state.round}
        players={state.players}
        roundScores={state.roundScores}
        round={state.round}
        targetScore={settings.targetScore}
        myId={myId}
        isHost={isHost}
        onNextRound={nextRound}
        onEndGame={handleEndGame}
        endGameConfirm={endGameConfirm}
      />
    );
  } else if (phase === 'dealing') {
    body = <DealingScreen round={state.round} />;
  } else {
    // ---- Turn banner ----
    const activePlayer = state.players.find(p => p.id === state.activePlayerId);
    const drawer = pendingAction ? state.players.find(p => p.id === pendingAction.drawerId) : undefined;
    const sevenBy = display.flipSevenAchievedBy
      ? state.players.find(p => p.id === display.flipSevenAchievedBy)
      : undefined;
    const waitingOn = chaos
      ? state.players.filter(p => p.roundStatus === 'active' && p.id !== myId && !state.chaosSubmitted.includes(p.id))
      : [];

    let bannerText: string;
    let bannerTone = 'var(--text-secondary)';
    if (sevenBy) {
      bannerText = sevenBy.id === myId ? '🎉 You hit FLIP 7! Round over' : `🎉 ${sevenBy.name} hit FLIP 7! Round over`;
      bannerTone = 'var(--game-accent)';
    } else if (roundEnding) {
      bannerText = revealBusy ? '🃏 Flipping…' : 'Round over · adding up scores…';
    } else if (pendingAction) {
      const info = ACTION_CARD_LABELS[pendingAction.cardKind];
      bannerText = iAmDrawer
        ? `${info.icon} ${info.name}! Choose your target`
        : `${info.icon} ${drawer?.name ?? 'Someone'} is choosing a ${info.name} target…`;
      bannerTone = info.color;
    } else if (chaos) {
      if (revealBusy) {
        bannerText = '⚡ Revealing everyone’s cards…';
      } else if (myActive && !iLocked) {
        bannerText = '⚡ Chaos round: everyone picks at once';
        bannerTone = 'var(--game-accent)';
      } else {
        bannerText = waitingOn.length > 0 ? `Waiting for ${listNames(waitingOn.map(p => p.name))}…` : 'Revealing…';
      }
    } else if (state.isMyTurn) {
      bannerText = '🎯 Your turn: hit or stay?';
      bannerTone = 'var(--game-accent)';
    } else if (activePlayer) {
      bannerText = `${activePlayer.avatar} ${activePlayer.name}'s turn`;
    } else {
      bannerText = 'Waiting…';
    }
    const timerTotal = pendingAction ? (settings.turnTimer || ACTION_TIMEOUT_MS / 1000) : settings.turnTimer;

    // ---- Footer: HIT / STAY or what's happening ----
    const myScore = computeRoundScore(state.myCards.map(c => c.value), state.myModifiers, false);
    const shownScore = computeRoundScore(display.myCards.map(c => c.value), display.myModifiers, false);
    const protectedBySecondChance = state.mySecondChances > 0;
    const riskPct = Math.round((state.myBustChance ?? 0) * 100);
    const riskTone = protectedBySecondChance
      ? 'var(--f7-second)'
      : riskPct < 15 ? 'var(--game-accent)' : riskPct < 35 ? 'var(--f7-flip3)' : 'var(--danger)';

    let statusLine: string;
    if (!inGame) statusLine = '👀 Watching this game. You can join the next one.';
    else if (display.myRoundStatus === 'busted') statusLine = '💀 Busted · 0 points this round';
    else if (display.myRoundStatus === 'frozen') statusLine = `❄️ Frozen · banked ${shownScore}`;
    else if (display.myRoundStatus === 'stayed') statusLine = `🛡️ Banked ${shownScore} · watching the table`;
    else if (iAmDrawer) statusLine = 'Get ready to pick a target…';
    else if (chaos && iLocked) statusLine = `🔒 Locked in${myChaosChoice ? `: ${myChaosChoice.toUpperCase()}` : ''} · waiting for others`;
    else if (chaos && revealBusy) statusLine = 'Revealing everyone’s cards…';
    else if (pendingAction) statusLine = `${drawer?.name ?? 'Someone'} is picking a target…`;
    else if (roundEnding) statusLine = revealBusy ? 'Watching the flip…' : 'Round over · adding up scores…';
    else if (activePlayer) statusLine = `Waiting for ${activePlayer.name}…`;
    else statusLine = 'Waiting…';

    const avatars = Object.fromEntries(state.players.map(p => [p.id, p.avatar]));
    const others = display.players.filter(p => p.id !== myId);

    body = (
      <div className="mx-auto flex h-dvh w-full max-w-lg flex-col f7-table">
        <header className="flex items-center gap-2 px-4 pb-2 pt-3">
          <span className="text-xl" aria-hidden="true">🃏</span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight text-(--text-primary)">
              Flip 7
              {chaos && (
                <span className="ml-1.5 rounded bg-(--game-secondary)/15 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-(--game-secondary)">
                  Chaos
                </span>
              )}
            </h1>
            <p className="truncate text-[11px] text-(--text-muted)">Round {state.round} · First to {settings.targetScore}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <DeckPile count={state.deckRemaining} />
            <button
              onClick={() => setShowRules(true)}
              aria-label="How to play"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-(--border) bg-(--bg-card) text-sm font-bold text-(--text-secondary) active:scale-95"
            >
              ?
            </button>
            {isHost && (
              <button
                onClick={handleEndGame}
                className={`h-11 rounded-full px-3 text-[11px] font-semibold transition-all ${
                  endGameConfirm ? 'bg-(--danger) text-white' : 'border border-(--border) text-(--text-muted)'
                }`}
              >
                {endGameConfirm ? 'Confirm?' : 'End game'}
              </button>
            )}
          </div>
        </header>

        <div className="px-4 pb-2">
          <div
            className="flex min-h-[40px] items-center gap-2 rounded-xl border px-3 py-2"
            style={{
              borderColor: `color-mix(in srgb, ${bannerTone} 35%, transparent)`,
              background: `color-mix(in srgb, ${bannerTone} 8%, transparent)`,
            }}
            aria-live="polite"
          >
            <p className="truncate text-sm font-semibold" style={{ color: bannerTone }}>{bannerText}</p>
            {timer !== null && (
              <span className={`ml-auto shrink-0 font-mono text-sm font-bold tabular-nums ${
                timer <= 5 ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-secondary)'
              }`}>
                {timer}s
              </span>
            )}
          </div>
          {timer !== null && timerTotal > 0 && (
            <div className="mt-1.5">
              <TimerBar seconds={timer} total={timerTotal} />
            </div>
          )}
        </div>

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
          {me && (
            <MyHand
              avatar={me.avatar}
              totalScore={me.cumulativeScore}
              targetScore={settings.targetScore}
              cards={display.myCards.map(c => c.value)}
              modifiers={display.myModifiers}
              secondChances={display.mySecondChances}
              status={display.myRoundStatus}
              bustCard={displayMe?.bustCard ?? null}
              isTurn={yourMove}
              ready={iLocked}
            />
          )}
          {others.length > 0 && (
            <section aria-label="Other players">
              <h2 className="mb-1.5 px-1 text-[10px] uppercase tracking-[0.15em] text-(--text-muted)">The table</h2>
              <div className="space-y-1.5">
                {others.map(p => (
                  <OpponentRow
                    key={p.id}
                    player={p}
                    isTurn={!chaos && !pendingAction && p.id === state.activePlayerId}
                    ready={chaos && state.chaosSubmitted.includes(p.id)}
                    picking={pendingAction?.drawerId === p.id}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="relative px-4 pt-2 f7-safe-bottom">
          {toast && (
            <div
              key={toast.key}
              role="status"
              className="pointer-events-none absolute bottom-full left-1/2 mb-2 max-w-[90vw] -translate-x-1/2 truncate rounded-full border border-(--border-light) bg-(--bg-elevated) px-3.5 py-1.5 text-xs font-semibold text-(--text-primary) shadow-lg f7-toast"
            >
              {toast.text}
            </div>
          )}
          {showButtons ? (
            <div className="flex gap-3">
              <button
                onClick={chaos ? () => chaosChoice('stay') : stay}
                disabled={buttonsDisabled}
                className="f7-btn-stay min-h-[64px] flex-1 rounded-2xl py-2.5"
              >
                <span className="block text-base font-bold tracking-wide">STAY</span>
                <span className="block text-[11px] text-(--text-secondary)">Bank {myScore}</span>
              </button>
              <button
                onClick={chaos ? () => chaosChoice('hit') : hit}
                disabled={buttonsDisabled}
                className="f7-btn-hit min-h-[64px] flex-[1.4] rounded-2xl py-2.5"
                style={{ '--f7-risk': riskTone } as CSSProperties}
              >
                <span className="block text-lg font-bold tracking-[0.08em]">HIT</span>
                <span className="block text-[11px] font-semibold opacity-80">
                  {protectedBySecondChance ? '💚 Second Chance ready' : `${riskPct}% bust risk`}
                </span>
              </button>
            </div>
          ) : (
            <p className="flex min-h-[64px] items-center justify-center rounded-2xl border border-(--border) bg-(--bg-card)/80 px-4 text-center text-sm text-(--text-secondary)">
              {statusLine}
            </p>
          )}
        </footer>

        {reveal?.kind === 'flip' && (
          <FlipAnimation key={reveal.key} flips={reveal.flips} myId={myId} avatars={avatars} />
        )}
        {reveal?.kind === 'action' && (
          <ActionAnimation key={reveal.key} action={reveal.action} myId={myId} />
        )}
        {showSheet && pendingAction && (
          <ActionSheet
            key={`${pendingAction.drawerId}-${pendingAction.cardKind}-${pendingAction.eligibleTargets.join(',')}`}
            pending={pendingAction}
            players={state.players}
            myId={myId}
            onSelect={chooseTarget}
            secondsLeft={timer}
            totalSeconds={timerTotal}
          />
        )}
      </div>
    );
  }

  return (
    <div data-game="flip-7" className="flex flex-1 flex-col">
      {body}
      {showQuickRules && state.round === 1 && (phase === 'dealing' || phase === 'playing') && (
        <QuickRules targetScore={settings.targetScore} yourMove={yourMove} onClose={closeQuickRules} />
      )}
      {showRules && <RulesSheet gameId="flip7" onClose={closeRules} />}
    </div>
  );
}
