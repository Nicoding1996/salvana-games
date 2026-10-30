'use client';

import { useState } from 'react';
import type { useRoom } from '@/lib/hub/useRoom';
import { usePoker } from '@/lib/games/poker/usePoker';
import type { PokerClientState, PokerPlayerInfo, PokerTurnTimer } from '@/types/games/poker';
import { POKER_REACTIONS } from '@/types/games/poker';
import RulesSheet from '@/components/shared/RulesSheet';
import Confetti from '@/components/shared/Confetti';
import PokerTable from './PokerTable';
import HoleCards from './HoleCards';
import ActionBar from './ActionBar';
import ActionLog from './ActionLog';
import GameOver from './GameOver';
import { formatChips, ordinal } from './format';

interface PokerGameProps {
  roomHook: ReturnType<typeof useRoom>;
}

export default function PokerGame({ roomHook }: PokerGameProps) {
  const { playerId, isHost, leaveRoom } = roomHook;
  const poker = usePoker();
  const { state, timer, reactions, notice, pending, cardsShown } = poker;
  const [showRules, setShowRules] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center" data-game="poker">
        <p className="animate-soft-pulse text-sm text-(--text-secondary)">♠️ Taking a seat…</p>
      </div>
    );
  }

  if (state.phase === 'finished') {
    return (
      <div className="flex flex-1 flex-col" data-game="poker">
        <GameOver
          state={state}
          myId={playerId}
          isHost={isHost}
          onRematch={poker.rematch}
          onBackToLobby={poker.endGame}
          onLeaveRoom={leaveRoom}
        />
      </div>
    );
  }

  const me = state.players.find(p => p.id === playerId) ?? null;
  const result = state.phase === 'roundEnd' ? state.handResult : null;
  const iWonShowdown = !!result && !result.uncontested && result.winners.some(w => w.playerId === playerId);
  const myShowdownCards = result && !result.uncontested ? result.winningCards : null;

  const handleEndGame = () => {
    if (!endConfirm) {
      setEndConfirm(true);
      setTimeout(() => setEndConfirm(false), 3000);
      return;
    }
    poker.endGame();
  };

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col" data-game="poker">
      {/* Header */}
      <header className="flex items-center gap-1 pl-4 pr-2 pt-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold leading-tight text-(--text-primary)">♠️ Poker</h1>
          <p className="text-[10px] text-(--text-muted)">Hand #{state.handNumber}</p>
        </div>

        <div
          key={state.blindsUp ? `up-${state.handNumber}` : 'blinds'}
          className={`mr-1 rounded-full border px-2.5 py-1 text-center leading-tight ${
            state.blindsUp
              ? 'animate-poker-pop border-(--game-secondary)/60 bg-(--game-secondary)/15'
              : 'border-(--border-light) bg-(--bg-card)'
          }`}
        >
          <p className="text-[11px] font-semibold tabular-nums text-(--text-primary)">
            Blinds {formatChips(state.smallBlind)}/{formatChips(state.bigBlind)}
          </p>
          {state.nextBlindIncrease !== null && state.nextBlindIncrease <= 3 && (
            <p className="text-[9px] text-(--brand)">
              ↑ {state.nextBlindIncrease === 1 ? 'next hand' : `in ${state.nextBlindIncrease} hands`}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowLog(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-(--text-secondary) active:scale-90"
          aria-label="Hand log"
        >
          📜
        </button>
        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold text-(--text-secondary) active:scale-90"
          aria-label="How to play"
        >
          ?
        </button>
        {isHost && (
          <button
            type="button"
            onClick={handleEndGame}
            className={`h-11 rounded-full px-3 text-[11px] font-semibold transition-colors ${
              endConfirm ? 'bg-(--danger) text-(--bg-primary)' : 'text-(--text-muted)'
            }`}
            aria-label={endConfirm ? 'Tap again to end the game' : 'End game'}
          >
            {endConfirm ? 'Tap again' : 'End'}
          </button>
        )}
      </header>

      {notice && (
        <div
          key={notice.id}
          className="animate-poker-feed fixed left-1/2 top-14 z-50 -translate-x-1/2 rounded-lg border border-(--danger)/40 bg-(--bg-elevated) px-4 py-2 text-sm text-(--text-primary) shadow-lg"
          role="alert"
        >
          {notice.text}
        </div>
      )}

      <PokerTable state={state} myId={playerId} timer={timer} reactions={reactions} />

      <HeroPanel
        state={state}
        me={me}
        cardsShown={cardsShown}
        onCardsShownChange={poker.setCardsShown}
        winningCards={iWonShowdown ? myShowdownCards : null}
        reaction={reactions.find(r => r.playerId === playerId)?.emoji ?? null}
        reactionId={reactions.find(r => r.playerId === playerId)?.id ?? null}
      />

      <div className="min-h-[104px]">
        {state.isMyTurn && me ? (
          <ActionBar
            key={`${state.handNumber}-${state.phase}-${state.actionHistory.length}`}
            callAmount={state.callAmount}
            currentBet={state.currentBet}
            myBet={me.currentBet}
            myChips={me.chips}
            potTotal={state.potTotal}
            minRaiseTo={state.minRaiseTo}
            maxRaiseTo={state.maxRaiseTo}
            canRaise={state.canRaise}
            smallBlind={state.smallBlind}
            bigBlind={state.bigBlind}
            pending={pending}
            timer={timer && timer.playerId === playerId ? timer : null}
            onFold={poker.fold}
            onCheck={poker.check}
            onCall={poker.call}
            onRaise={poker.raise}
            onAllIn={poker.allIn}
          />
        ) : (
          <WaitingBar state={state} me={me} timer={timer} onReact={poker.sendReaction} />
        )}
      </div>

      {iWonShowdown && <Confetti key={`win-${state.handNumber}`} />}
      {showRules && <RulesSheet gameId="poker" onClose={() => setShowRules(false)} />}
      {showLog && (
        <ActionLog
          actions={state.actionHistory}
          handNumber={state.handNumber}
          myId={playerId}
          onClose={() => setShowLog(false)}
        />
      )}
    </div>
  );
}

// ---- Your seat: cards, stack, position ----

interface HeroPanelProps {
  state: PokerClientState;
  me: PokerPlayerInfo | null;
  cardsShown: boolean;
  onCardsShownChange: (shown: boolean) => void;
  winningCards: PokerClientState['communityCards'] | null;
  reaction: string | null;
  reactionId: number | null;
}

function HeroPanel({ state, me, cardsShown, onCardsShownChange, winningCards, reaction, reactionId }: HeroPanelProps) {
  if (!me) {
    return (
      <div className="px-4 py-3 text-center">
        <p className="text-sm text-(--text-secondary)">👀 Spectating</p>
        <p className="text-xs text-(--text-muted)">You&apos;ll be dealt in next game</p>
      </div>
    );
  }

  if (!me.alive) {
    const out = state.eliminationOrder.find(e => e.id === me.id);
    return (
      <div className="px-4 py-3 text-center">
        <p className="text-sm font-semibold text-(--text-secondary)">
          💀 You&apos;re out{out ? ` · ${ordinal(out.place)} place` : ''}
        </p>
        <p className="text-xs text-(--text-muted)">
          {out?.eliminatedBy ? `Knocked out by ${out.eliminatedBy} · ` : ''}Watching the final table
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center gap-4 px-4 pb-1">
      {reaction && reactionId !== null && (
        <span key={reactionId} className="animate-poker-reaction pointer-events-none absolute -top-4 right-[30%] text-2xl" aria-hidden="true">
          {reaction}
        </span>
      )}

      <HoleCards
        cards={state.myCards}
        hand={state.myHand}
        handNumber={state.handNumber}
        shown={cardsShown}
        onShownChange={onCardsShownChange}
        folded={me.folded}
        winningCards={winningCards}
      />

      <div className="flex min-w-[96px] flex-col items-start gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xl" aria-hidden="true">{me.avatar}</span>
          <span className="text-sm font-semibold text-(--text-primary)">You</span>
          {me.isDealer && <span className="poker-dealer-btn" aria-label="Dealer">D</span>}
          {(me.isSmallBlind || me.isBigBlind) && (
            <span className="rounded-full border border-(--border-light) px-1.5 text-[9px] font-bold text-(--text-secondary)">
              {me.isSmallBlind ? 'SB' : 'BB'}
            </span>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-base font-bold tabular-nums text-(--game-secondary)">
          <span className="poker-chip poker-chip-lg" aria-hidden="true" />
          {formatChips(me.chips)}
        </p>
        {state.phase === 'roundEnd' ? (
          me.chips === 0 && <span className="text-[11px] font-bold uppercase tracking-wider text-(--danger)">Busted</span>
        ) : (
          me.allIn && !me.folded && (
            <span className="animate-poker-allin text-[11px] font-bold uppercase tracking-wider text-(--danger)">All in</span>
          )
        )}
        {state.settings.bountyMode && me.knockouts > 0 && (
          <span className="text-[11px] text-(--text-secondary)">💀 {me.knockouts} knockout{me.knockouts === 1 ? '' : 's'}</span>
        )}
      </div>
    </div>
  );
}

// ---- Bottom bar when it isn't your decision ----

interface WaitingBarProps {
  state: PokerClientState;
  me: PokerPlayerInfo | null;
  timer: PokerTurnTimer | null;
  onReact: (emoji: (typeof POKER_REACTIONS)[number]) => void;
}

function WaitingBar({ state, me, timer, onReact }: WaitingBarProps) {
  const active = state.players.find(p => p.id === state.activePlayerId) ?? null;
  const activeTimer = active && timer?.playerId === active.id ? timer : null;

  let message: string;
  if (state.phase === 'dealing') message = 'Shuffling up and dealing…';
  else if (state.runout) message = 'All in — dealing the rest of the board';
  else if (state.phase === 'roundEnd') message = 'Next hand coming up…';
  else if (active) message = `Waiting for ${active.avatar} ${active.name}`;
  else message = 'Waiting…';

  return (
    <div className="px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1">
      <p className="mb-1 flex items-center justify-center gap-1.5 text-center text-[13px] text-(--text-secondary)">
        <span className="truncate">{message}</span>
        {activeTimer && (
          <span className={`font-mono font-bold ${activeTimer.secondsLeft <= 5 ? 'animate-timer-urgent text-(--danger)' : 'text-(--text-muted)'}`}>
            {activeTimer.secondsLeft}s
          </span>
        )}
      </p>
      {active && !active.connected && (
        <p className="mb-1 text-center text-[11px] text-(--text-muted)">Away — they&apos;ll auto check or fold</p>
      )}
      {me?.inHand && me.folded && state.phase !== 'roundEnd' && (
        <p className="mb-1 text-center text-[11px] text-(--text-muted)">You folded this hand</p>
      )}
      <div className="flex justify-center gap-1" role="group" aria-label="Send a reaction">
        {POKER_REACTIONS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-transform active:scale-125"
            aria-label={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
