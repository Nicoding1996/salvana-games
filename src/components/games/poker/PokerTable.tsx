'use client';

import type { LoggedAction, PokerClientState, PokerPlayerInfo, PokerTurnTimer } from '@/types/games/poker';
import { HAND_RANK_NAMES, isBettingPhase } from '@/types/games/poker';
import type { PokerReactionBubble } from '@/lib/games/poker/usePoker';
import PlayerSeat, { type SeatResult } from './PlayerSeat';
import CommunityCards from './CommunityCards';
import PotDisplay from './PotDisplay';
import HandResult from './HandResult';
import { SEAT_ACTION_LABELS, describeAction, formatChips } from './format';

// Seat angles in degrees (screen coords: 90 = bottom, 180 = left, 270 = top),
// clockwise from the seat on your left. The bottom is yours, so it stays free.
const SEAT_ANGLES: Record<number, number[]> = {
  1: [270],
  2: [215, 325],
  3: [185, 270, 355],
  4: [168, 228, 312, 372],
  5: [158, 210, 270, 330, 382],
  6: [150, 194, 242, 298, 346, 390],
  7: [146, 184, 224, 270, 316, 356, 394],
  8: [90, 136, 180, 225, 270, 315, 360, 404],   // spectating: nobody sits at the bottom
};
const RADIUS_X = 39.5;
const RADIUS_Y = 37;

interface PokerTableProps {
  state: PokerClientState;
  myId: string | null;
  timer: PokerTurnTimer | null;
  reactions: PokerReactionBubble[];
}

export default function PokerTable({ state, myId, timer, reactions }: PokerTableProps) {
  const me = state.players.find(p => p.id === myId) ?? null;
  const heroSeated = !!me && me.alive;
  const opponents = orderOpponents(state.players, myId, heroSeated);
  const angles = SEAT_ANGLES[Math.min(8, opponents.length)] ?? SEAT_ANGLES[8];

  const result = state.phase === 'roundEnd' ? state.handResult : null;
  const showdown = result && !result.uncontested ? result : null;
  const winningCards = showdown ? showdown.winningCards : null;
  const street = isBettingPhase(state.phase) ? state.phase : null;

  // Latest action per player on the current street
  const streetActions = new Map<string, LoggedAction>();
  if (street) {
    for (const entry of state.actionHistory) {
      if (entry.phase === street) streetActions.set(entry.playerId, entry.action);
    }
  }

  const seatResult = (id: string): SeatResult | null => {
    if (!result) return null;
    const hand = showdown?.hands.find(h => h.playerId === id);
    const won = result.winners.find(w => w.playerId === id)?.amount ?? 0;
    if (!hand && won === 0) return null;
    // Seats get the short rank; the center banner carries the full description
    return { amountWon: won, handLabel: hand ? HAND_RANK_NAMES[hand.handEvaluation.rank] : null };
  };

  const myAction = me ? streetActions.get(me.id) ?? null : null;
  const lastEntry = state.actionHistory[state.actionHistory.length - 1];

  return (
    <div className="relative min-h-[300px] w-full flex-1 select-none" aria-label="Poker table">
      <div className="poker-felt" aria-hidden="true" />

      {/* Center: pot, board, table talk */}
      <div className="absolute left-1/2 top-[34%] z-0 -translate-x-1/2 -translate-y-1/2">
        {!result && <PotDisplay pots={state.pots} potTotal={state.potTotal} />}
      </div>

      <div className="absolute left-1/2 top-[49%] z-0 -translate-x-1/2 -translate-y-1/2">
        <CommunityCards cards={state.communityCards} handNumber={state.handNumber} winningCards={winningCards} />
      </div>

      <div className="absolute left-1/2 top-[64%] z-[5] w-[50%] -translate-x-1/2 -translate-y-1/2 text-center">
        {result ? (
          <HandResult
            result={result}
            myId={myId}
            handNumber={state.handNumber}
            nextHandInMs={state.nextHandInMs}
          />
        ) : (
          <p
            key={`${state.handNumber}-${state.phase}-${state.actionHistory.length}-${state.runout}`}
            className="animate-poker-feed text-[11px] leading-snug text-(--text-primary)/85"
            role="status"
            aria-live="polite"
          >
            {state.phase === 'dealing' ? (
              state.blindsUp ? (
                <span className="font-semibold text-(--game-secondary)">
                  ⬆️ Blinds up · {formatChips(state.smallBlind)}/{formatChips(state.bigBlind)}
                </span>
              ) : (
                <>Dealing hand #{state.handNumber}…</>
              )
            ) : state.runout ? (
              <span className="animate-poker-allin font-semibold text-(--game-secondary)">All in · running it out</span>
            ) : lastEntry ? (
              describeAction(lastEntry, lastEntry.playerId === myId)
            ) : null}
          </p>
        )}
      </div>

      {!result && (
        <p className="poker-felt-mark pointer-events-none absolute left-1/2 top-[77%] -translate-x-1/2 text-[9px] font-semibold" aria-hidden="true">
          SALVANA
        </p>
      )}

      {/* Your chips in front of you */}
      {heroSeated && me && myAction && !result && (
        <div className="absolute left-1/2 top-[86%] z-10 -translate-x-1/2 -translate-y-1/2">
          <span className="poker-pill animate-poker-feed text-(--text-primary)">
            {me.currentBet > 0 && <span className="poker-chip" aria-hidden="true" />}
            {SEAT_ACTION_LABELS[myAction]}
            {me.currentBet > 0 && <span className="text-(--game-secondary)">{formatChips(me.currentBet)}</span>}
          </span>
        </div>
      )}

      {opponents.map((player, i) => {
        const rad = ((angles[i] ?? 270) * Math.PI) / 180;
        const isActive = state.activePlayerId === player.id;
        return (
          <PlayerSeat
            key={player.id}
            player={player}
            x={50 + RADIUS_X * Math.cos(rad)}
            y={50 + RADIUS_Y * Math.sin(rad)}
            handNumber={state.handNumber}
            isActive={isActive}
            timer={isActive && timer?.playerId === player.id ? timer : null}
            lastAction={streetActions.get(player.id) ?? null}
            tabledCards={player.holeCards}
            winningCards={winningCards}
            result={seatResult(player.id)}
            bountyMode={state.settings.bountyMode}
            reaction={reactions.find(r => r.playerId === player.id) ?? null}
            handOver={!!result}
          />
        );
      })}
    </div>
  );
}

/** Players still in the tournament, clockwise starting from the seat on your left. */
function orderOpponents(players: PokerPlayerInfo[], myId: string | null, heroSeated: boolean): PokerPlayerInfo[] {
  const myIndex = players.findIndex(p => p.id === myId);
  const start = myIndex >= 0 ? myIndex + 1 : 0;
  const rotated = [...players.slice(start), ...players.slice(0, start)];
  return rotated.filter(p => p.alive && !(heroSeated && p.id === myId));
}
