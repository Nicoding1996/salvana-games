'use client';

import { useCallback, useState } from 'react';
import type { useRoom } from '@/lib/hub/useRoom';
import { useLiarsDice } from '@/lib/games/liars-dice/useLiarsDice';
import { bidOdds, oddsTone, percent } from '@/lib/games/liars-dice/odds';
import type { Bid, LiarsDiceClientState, LiarsDiceSettings, LiarsDiceTurnTimer } from '@/types/games/liars-dice';
import RulesSheet from '@/components/shared/RulesSheet';
import EndGameButton from '@/components/shared/EndGameButton';
import TimerBar from '@/components/shared/TimerBar';
import PlayerRing from './PlayerRing';
import DiceDisplay from './DiceDisplay';
import DiceIcon from './DiceIcon';
import BidPanel, { defaultBid } from './BidPanel';
import BidHistory from './BidHistory';
import RevealPhase from './RevealPhase';
import GameOver from './GameOver';

interface LiarsDiceGameProps {
  roomHook: ReturnType<typeof useRoom>;
}

// The first-round quick rules are shown once per page load.
let quickRulesSeen = false;

function QuickRules({ settings, yourMove, onClose }: { settings: LiarsDiceSettings; yourMove: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="ld-quick-rules">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div className="dice-card relative w-full max-w-lg rounded-t-3xl px-5 pt-5 ld-safe-bottom ld-sheet-up">
        <h2 id="ld-quick-rules" className="text-center text-lg font-bold text-(--text-primary)">🎲 How Liar&apos;s Dice works</h2>
        <ul className="mt-4 space-y-3 text-sm text-(--text-secondary)">
          <li className="flex items-center gap-3">
            <span className="flex w-16 shrink-0 justify-center gap-0.5" aria-hidden="true">
              <DiceIcon value={3} size={20} /><DiceIcon value={5} size={20} /><DiceIcon value={1} size={20} hidden />
            </span>
            <span>Everyone rolls 5 dice. Only you can see yours.</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex w-16 shrink-0 items-center justify-center gap-1 font-heading font-bold text-(--text-primary)" aria-hidden="true">
              3 × <DiceIcon value={4} size={20} />
            </span>
            <span>On your turn, bid how many of one face are on the <strong className="text-(--text-primary)">whole table</strong>, counting everyone&apos;s dice.</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-center text-xl" aria-hidden="true">⬆️</span>
            <span>Each bid must go up: more dice, or the same number of a higher face.</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-center font-heading text-sm font-bold text-(--danger)" aria-hidden="true">LIAR!</span>
            <span>Don&apos;t believe the last bid? Call it. Wrong bid → the bidder loses a ❤️. True bid → you do.</span>
          </li>
          {settings.wildOnes && (
            <li className="flex items-center gap-3">
              <span className="flex w-16 shrink-0 justify-center" aria-hidden="true"><DiceIcon value={1} size={22} wild /></span>
              <span>Wild 1s: every 1 also counts as the face being bid.</span>
            </li>
          )}
          {settings.spotOn && (
            <li className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-center text-xl" aria-hidden="true">🎯</span>
              <span>Spot On: call the bid exactly right and everyone else loses a ❤️. Miss and you lose one.</span>
            </li>
          )}
        </ul>
        <p className="mt-4 text-center text-xs text-(--text-muted)">The bid buttons show the odds from your dice. Last one with hearts wins.</p>
        {yourMove && <p className="mt-2 text-center text-sm font-semibold text-(--game-accent) animate-soft-pulse">It&apos;s your turn!</p>}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) transition-transform active:scale-[0.97]"
        >
          {yourMove ? 'Play my turn' : 'Let’s roll'}
        </button>
      </div>
    </div>
  );
}

// ---- The bid on the table ----

function CurrentBidCard({ state, myId, compact }: { state: LiarsDiceClientState; myId: string | null; compact: boolean }) {
  const bid = state.currentBid;
  const opener = state.players.find(p => p.id === state.activePlayerId);

  if (!bid) {
    return (
      <div className={`mx-4 rounded-2xl border border-dashed border-(--border-light) px-4 text-center ${compact ? 'py-2.5' : 'py-4'}`}>
        <p className="text-sm font-semibold text-(--text-primary)">No bids yet</p>
        <p className="mt-0.5 text-xs text-(--text-secondary)">
          {state.isMyTurn ? 'You open the round. Any bid goes.' : `${opener?.avatar ?? ''} ${opener?.name ?? 'Someone'} opens the round`}
        </p>
      </div>
    );
  }

  const mine = bid.playerId === myId;
  const inRound = state.myDice.length > 0;
  const odds = bidOdds(bid, state.myDice, state.totalDiceOnTable, state.settings.wildOnes);
  const bidder = state.players.find(p => p.id === bid.playerId);

  // Your turn: one line, so the bid builder below has the room (the buttons carry the odds)
  if (compact) {
    return (
      <div key={state.bidHistory.length} className="dice-card mx-4 flex items-center gap-2.5 rounded-2xl px-3.5 py-2 ld-bid-in">
        <span className="min-w-0 flex-1 truncate text-xs text-(--text-secondary)">
          <span aria-hidden="true">{bidder?.avatar}</span> {mine ? 'Your bid' : `${bid.playerName} bids`}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="font-heading text-2xl font-bold tabular-nums text-(--text-primary)">{bid.quantity}</span>
          <span className="text-sm text-(--text-muted)" aria-hidden="true">×</span>
          <DiceIcon value={bid.faceValue} size={28} wild={state.settings.wildOnes} />
        </span>
        {inRound && !mine && (
          <span className="shrink-0 text-right text-xs font-bold tabular-nums" style={{ color: oddsTone(odds.atLeast) }}>
            {percent(odds.atLeast)}% true
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mx-4">
      <div key={state.bidHistory.length} className="dice-card flex items-center gap-3 rounded-2xl px-4 py-3 ld-bid-in">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">
            {mine ? 'Your bid' : `${bidder?.avatar ?? ''} ${bid.playerName} bids`}
          </p>
          <p className="mt-0.5 flex items-center gap-2">
            <span className="font-heading text-4xl font-bold tabular-nums text-(--text-primary)">{bid.quantity}</span>
            <span className="text-xl text-(--text-muted)" aria-hidden="true">×</span>
            <DiceIcon value={bid.faceValue} size={40} wild={state.settings.wildOnes} />
          </p>
        </div>
        {inRound && !mine && (
          <div className="shrink-0 text-right">
            <p className="font-heading text-2xl font-bold tabular-nums" style={{ color: oddsTone(odds.atLeast) }}>{percent(odds.atLeast)}%</p>
            <p className="text-[10px] text-(--text-muted)">chance it&apos;s true</p>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-(--text-muted)">
        {inRound
          ? `You hold ${odds.mine} · ${state.totalDiceOnTable} dice on the table${state.settings.wildOnes && bid.faceValue !== 1 ? ' · 1s count too' : ''}`
          : `${state.totalDiceOnTable} dice on the table`}
      </p>
    </div>
  );
}

// ---- Bottom bar when it isn't your move ----

function StatusBar({ state, myId, timer }: { state: LiarsDiceClientState; myId: string | null; timer: LiarsDiceTurnTimer | null }) {
  const me = state.players.find(p => p.id === myId);
  const active = state.players.find(p => p.id === state.activePlayerId);
  const activeTimer = active && timer?.playerId === active.id ? timer : null;

  let text: string;
  if (state.phase === 'rolling') text = '🎲 Everyone is rolling…';
  else if (active) text = `Waiting for ${active.avatar} ${active.name}…`;
  else text = 'Waiting…';

  return (
    <div className="border-t border-(--border) bg-(--bg-card)/80 px-4 pt-3 ld-safe-bottom">
      {me && !me.alive && (
        <p className="mb-2 text-center text-xs font-semibold text-(--text-secondary)">💀 You&apos;re out · watching the table</p>
      )}
      {!me && <p className="mb-2 text-center text-xs text-(--text-secondary)">👀 Watching this game</p>}
      <div className="flex min-h-11 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-(--text-secondary)">{text}</p>
        {activeTimer && (
          <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${activeTimer.secondsLeft <= 5 ? 'text-(--danger) animate-timer-urgent' : 'text-(--text-muted)'}`}>
            {activeTimer.secondsLeft}s
          </span>
        )}
      </div>
      {activeTimer && activeTimer.total > 0 && (
        <div className="mb-1">
          <TimerBar seconds={activeTimer.secondsLeft} total={activeTimer.total} />
        </div>
      )}
      {active && !active.connected && state.phase === 'bidding' && (
        <p className="mt-1 text-center text-[11px] text-(--text-muted)">{active.name} is away · their turn plays automatically</p>
      )}
    </div>
  );
}

export default function LiarsDiceGame({ roomHook }: LiarsDiceGameProps) {
  const { playerId, isHost, leaveRoom, room } = roomHook;
  const game = useLiarsDice();
  const { state, timer, pending, notice } = game;
  const [showRules, setShowRules] = useState(false);
  const [showQuickRules, setShowQuickRules] = useState(() => !quickRulesSeen);
  const closeRules = useCallback(() => setShowRules(false), []);

  // A fresh draft bid at the start of each of my turns (adjusting state while rendering)
  const turnKey = state?.isMyTurn ? `${state.roundNumber}:${state.bidHistory.length}` : null;
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Bid | null>(null);
  if (turnKey !== draftKey) {
    setDraftKey(turnKey);
    setDraft(turnKey && state ? defaultBid(state.currentBid, state.myDice, state.settings.wildOnes, state.totalDiceOnTable) : null);
  }

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center" data-game="liars-dice">
        <p className="text-sm text-(--text-secondary) animate-soft-pulse">🎲 Pulling up a chair…</p>
      </div>
    );
  }

  const { phase, players, settings } = state;
  const me = players.find(p => p.id === playerId);
  const inRound = state.myDice.length > 0;
  const hostName = room ? room.players[room.hostId]?.name ?? 'the host' : 'the host';

  if (phase === 'finished') {
    const online = room ? Object.values(room.players).filter(p => p.connected).length : 0;
    return (
      <div data-game="liars-dice" className="flex flex-1 flex-col">
        <GameOver
          players={players}
          eliminationOrder={state.eliminationOrder}
          winnerId={state.winnerId}
          stats={state.stats}
          rounds={state.roundNumber}
          myId={playerId}
          isHost={isHost}
          hostName={hostName}
          canRematch={online >= 2}
          onRematch={game.rematch}
          onBackToLobby={game.endGame}
          onLeaveRoom={leaveRoom}
        />
      </div>
    );
  }

  const revealing = (phase === 'challenge' || phase === 'roundEnd') && !!state.lastChallengeResult;
  const myMove = state.isMyTurn && !!me?.alive;
  const focusFace = myMove ? draft?.faceValue ?? null : state.currentBid?.faceValue ?? null;
  const stillRolling = players
    .filter(p => p.alive && p.connected && !p.rolled && p.id !== playerId)
    .map(p => p.name);

  return (
    <div data-game="liars-dice" className="mx-auto flex h-dvh w-full max-w-lg flex-col ld-table">
      <header className="flex items-center gap-2 px-4 pt-3">
        <span className="text-xl" aria-hidden="true">🎲</span>
        <div className="min-w-0">
          <h1 className="text-sm font-bold leading-tight text-(--text-primary)">Liar&apos;s Dice</h1>
          <p className="truncate text-[11px] text-(--text-muted)">
            Round {state.roundNumber} · {state.totalDiceOnTable} dice on the table
            {settings.wildOnes && ' · 1s wild'}
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

      <PlayerRing players={players} phase={phase} activePlayerId={state.activePlayerId} myId={playerId} timer={timer} />

      <main className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${myMove ? '' : 'pt-2'}`}>
        {/* my-auto: centered in the free space, but never clipped when it overflows */}
        <div className={revealing ? '' : myMove ? 'my-auto py-1' : 'my-auto py-2'}>
        {revealing && state.lastChallengeResult ? (
          <RevealPhase
            key={state.roundNumber}
            result={state.lastChallengeResult}
            players={players}
            phase={phase}
            myId={playerId}
            settings={settings}
          />
        ) : phase === 'rolling' ? (
          <div className="flex flex-col items-center px-6 pt-4 text-center animate-fade-in">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--text-muted)">Round {state.roundNumber}</p>
            <h2 className="mt-1 text-xl font-bold text-(--text-primary)">{inRound ? 'Roll your dice' : 'Everyone is rolling'}</h2>
            <p className="mt-1 text-sm text-(--text-secondary)">
              {(() => {
                const opener = players.find(p => p.id === state.activePlayerId);
                if (!opener) return 'Then the bidding starts.';
                return opener.id === playerId ? 'Then you open the bidding.' : `Then ${opener.name} opens the bidding.`;
              })()}
            </p>
          </div>
        ) : (
          <div className={myMove ? 'space-y-2' : 'space-y-3'}>
            <CurrentBidCard state={state} myId={playerId} compact={myMove} />
            <BidHistory entries={state.bidHistory} myId={playerId} wildOnes={settings.wildOnes} compact={myMove} />
          </div>
        )}
        </div>
      </main>

      {!revealing && inRound && (
        <div className="pb-3 pt-1">
          <DiceDisplay
            dice={state.myDice}
            rollingPhase={phase === 'rolling'}
            alreadyRolled={!!me?.rolled}
            wildOnes={settings.wildOnes}
            focusFace={focusFace}
            waitingFor={stillRolling}
            onRollComplete={game.rollComplete}
            compactOnShortScreens={myMove}
          />
        </div>
      )}

      {!revealing && (myMove && draft ? (
        <BidPanel
          draft={draft}
          onDraftChange={setDraft}
          currentBid={state.currentBid}
          totalDiceOnTable={state.totalDiceOnTable}
          myDice={state.myDice}
          wildOnes={settings.wildOnes}
          spotOnEnabled={settings.spotOn}
          pending={pending}
          onPlaceBid={game.placeBid}
          onCallLiar={game.callLiar}
          onCallSpotOn={game.callSpotOn}
        />
      ) : phase !== 'rolling' || !inRound ? (
        <StatusBar state={state} myId={playerId} timer={timer} />
      ) : null)}

      {notice && (
        <div
          key={notice.id}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`fixed left-1/2 top-16 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border bg-(--bg-elevated) px-4 py-2 text-center text-sm text-(--text-primary) shadow-lg animate-slide-up ${
            notice.tone === 'error' ? 'border-(--danger)/40' : 'border-(--border-light)'
          }`}
        >
          {notice.text}
        </div>
      )}

      {showQuickRules && state.roundNumber === 1 && (phase === 'rolling' || phase === 'bidding') && (
        <QuickRules
          settings={settings}
          yourMove={myMove}
          onClose={() => {
            quickRulesSeen = true;
            setShowQuickRules(false);
          }}
        />
      )}
      {showRules && <RulesSheet gameId="liars-dice" onClose={closeRules} />}
    </div>
  );
}
