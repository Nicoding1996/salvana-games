'use client';

import type { PokerClientState } from '@/types/games/poker';
import Confetti from '@/components/shared/Confetti';
import { formatChips, ordinal } from './format';

interface GameOverProps {
  state: PokerClientState;
  myId: string | null;
  isHost: boolean;
  onRematch: () => void;
  onBackToLobby: () => void;
  onLeaveRoom: () => void;
}

export default function GameOver({ state, myId, isHost, onRematch, onBackToLobby, onLeaveRoom }: GameOverProps) {
  const winner = state.players.find(p => p.id === state.winnerId) ?? null;
  const iWon = !!winner && winner.id === myId;

  // Winner first, then the rest by finishing place
  const standings = [
    ...(winner ? [{ id: winner.id, name: winner.name, avatar: winner.avatar, place: 1, eliminatedBy: null as string | null, left: false }] : []),
    ...[...state.eliminationOrder].sort((a, b) => a.place - b.place),
  ];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6">
      <Confetti />

      {winner && (
        <div className="animate-celebrate mb-6 text-center">
          <div className="poker-seat-winner relative mx-auto mb-2 w-fit">
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-3xl" aria-hidden="true">👑</span>
            <div className="poker-seat-avatar mx-auto h-20! w-20! text-5xl!">
              <span aria-hidden="true">{winner.avatar}</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-(--text-primary)">
            {iWon ? 'You win the tournament!' : `${winner.name} wins!`}
          </h2>
          <p className="mt-1 text-sm text-(--game-secondary)">
            🪙 {formatChips(winner.chips)} chips · {state.handNumber} hands
          </p>
        </div>
      )}

      {state.superlatives.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 text-center text-[10px] uppercase tracking-[0.15em] text-(--text-muted)">Awards</h3>
          <div className="grid grid-cols-2 gap-2">
            {state.superlatives.map(s => (
              <div key={s.title} className="rounded-xl border border-(--border) bg-(--bg-card) px-3 py-2">
                <p className="text-sm font-semibold text-(--text-primary)">
                  <span className="mr-1" aria-hidden="true">{s.emoji}</span>{s.title}
                </p>
                <p className="truncate text-xs text-(--game-secondary)">{s.playerId === myId ? 'You' : s.playerName}</p>
                <p className="text-[11px] leading-snug text-(--text-secondary)">{s.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6 rounded-xl border border-(--border) bg-(--bg-card) p-3">
        <h3 className="mb-2 text-center text-[10px] uppercase tracking-[0.15em] text-(--text-muted)">Final Standings</h3>
        <ol className="space-y-1">
          {standings.map(p => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${p.id === myId ? 'bg-(--bg-elevated) ring-1 ring-(--game-secondary)/30' : ''}`}
            >
              <span className={`w-9 text-sm font-bold ${p.place === 1 ? 'text-(--game-secondary)' : 'text-(--text-muted)'}`}>
                {ordinal(p.place)}
              </span>
              <span className="text-xl" aria-hidden="true">{p.avatar}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-(--text-primary)">
                {p.id === myId ? 'You' : p.name}
                {p.left && <span className="ml-1.5 text-xs text-(--text-muted)">left</span>}
              </span>
              {p.place === 1 ? (
                <span aria-label="Winner">👑</span>
              ) : (
                state.settings.bountyMode && p.eliminatedBy && (
                  <span className="truncate text-[11px] text-(--text-muted)">💀 by {p.eliminatedBy}</span>
                )
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-auto space-y-2">
        {isHost ? (
          <>
            <button
              type="button"
              onClick={onRematch}
              className="poker-btn-raise h-14 w-full rounded-xl text-base font-bold transition-transform active:scale-[0.97]"
            >
              🔄 Rematch
            </button>
            <button
              type="button"
              onClick={onBackToLobby}
              className="h-12 w-full rounded-xl border border-(--border) bg-(--bg-card) text-sm text-(--text-secondary) transition-transform active:scale-[0.97]"
            >
              🏠 Back to Lobby
            </button>
          </>
        ) : (
          <>
            <p className="animate-soft-pulse text-center text-sm text-(--text-muted)">Waiting for host...</p>
            <button
              type="button"
              onClick={onLeaveRoom}
              className="h-11 w-full text-xs text-(--text-muted) transition-colors hover:text-(--text-secondary)"
            >
              Leave Room
            </button>
          </>
        )}
      </div>
    </div>
  );
}
