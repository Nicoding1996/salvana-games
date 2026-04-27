'use client';

import type { ChallengeResult, LiarsDicePlayerInfo, LiarsDiceSettings } from '@/types/games/liars-dice';
import { DIE_FACE_LABELS } from '@/types/games/liars-dice';
import DiceIcon from './DiceIcon';
import Confetti from '@/components/shared/Confetti';

interface RevealPhaseProps {
  result: ChallengeResult;
  players: LiarsDicePlayerInfo[];
  myId: string | null;
  settings: LiarsDiceSettings;
}

export default function RevealPhase({ result, players, myId, settings }: RevealPhaseProps) {
  const iWon = result.type === 'liar'
    ? result.loserId !== myId
    : result.type === 'spotOn' && result.wasCorrect
      ? result.callerId === myId
      : result.loserId !== myId;

  const callerPlayer = players.find(p => p.id === result.callerId);
  const bidderPlayer = players.find(p => p.id === result.bidderId);
  const bidFace = result.bid.faceValue;

  // A die counts toward the bid if it matches the face value,
  // OR if wild ones is on and it's a 1 (and bid isn't for 1s)
  const dieCountsForBid = (val: number) => {
    if (val === bidFace) return true;
    if (settings.wildOnes && val === 1 && bidFace !== 1) return true;
    return false;
  };

  return (
    <div className="flex-1 flex flex-col items-center gap-4 p-4 animate-fade-in overflow-y-auto">
      {iWon && <Confetti />}

      {/* Challenge announcement */}
      <div className="text-center pt-2">
        {result.type === 'liar' ? (
          <h2 className="text-xl font-bold text-(--text-primary)">
            {callerPlayer?.avatar} {callerPlayer?.name} called <span className="text-(--danger)">LIAR!</span>
          </h2>
        ) : (
          <h2 className="text-xl font-bold text-(--text-primary)">
            {callerPlayer?.avatar} {callerPlayer?.name} called <span className="text-(--game-secondary)">SPOT ON!</span>
          </h2>
        )}
      </div>

      {/* Bid vs Actual — big comparison card */}
      <div className="bg-(--bg-card) border border-(--border) rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-around">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-(--text-muted) mb-2">Bid</p>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="text-3xl font-bold text-(--text-primary)">{result.bid.quantity}</span>
              <span className="text-xl text-(--text-muted)">×</span>
              <DiceIcon value={bidFace} size={36} />
            </div>
            <p className="text-xs text-(--text-secondary) mt-1">by {bidderPlayer?.name}</p>
          </div>

          <div className="text-3xl text-(--text-muted) font-light">vs</div>

          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-(--text-muted) mb-2">Actual</p>
            <div className="flex items-center gap-1.5 justify-center">
              <span className={`text-3xl font-bold ${
                result.actualCount >= result.bid.quantity ? 'text-(--success)' : 'text-(--danger)'
              }`}>
                {result.actualCount}
              </span>
              <span className="text-xl text-(--text-muted)">×</span>
              <DiceIcon value={bidFace} size={36} highlighted={result.actualCount >= result.bid.quantity} />
            </div>
            {settings.wildOnes && bidFace !== 1 && (
              <p className="text-[10px] text-(--text-muted) mt-1">
                incl. wild ⚀
              </p>
            )}
          </div>
        </div>
      </div>

      {/* All players' dice revealed */}
      <div className="w-full max-w-sm space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-(--text-muted) px-1">All Dice Revealed</p>
        {players.filter(p => p.alive || result.allDice[p.id]).map((player) => {
          const dice = result.allDice[player.id];
          if (!dice) return null;

          const isLoser = player.id === result.loserId ||
            (result.losersIfSpotOn?.includes(player.id) ?? false);

          return (
            <div
              key={player.id}
              className={`rounded-xl p-2.5 flex items-center gap-2 transition-all ${
                isLoser
                  ? 'bg-(--danger)/10 border border-(--danger)/20'
                  : 'bg-(--bg-elevated) border border-(--border)'
              }`}
            >
              <div className="flex flex-col items-center min-w-[44px]">
                <span className="text-lg">{player.avatar}</span>
                <span className="text-[10px] text-(--text-secondary) truncate max-w-[44px]">{player.name}</span>
              </div>
              <div className="flex gap-1.5 flex-1 justify-end flex-wrap">
                {dice.map((val, i) => (
                  <DiceIcon
                    key={i}
                    value={val}
                    size={32}
                    highlighted={dieCountsForBid(val)}
                    wild={settings.wildOnes}
                    className="animate-dice-reveal"
                  />
                ))}
              </div>
              {isLoser && <span className="text-sm shrink-0">💔</span>}
            </div>
          );
        })}
      </div>

      {/* Result announcement */}
      <div className={`text-center py-3 px-5 rounded-xl w-full max-w-sm animate-celebrate ${
        result.wasCorrect ? 'bg-(--success)/10 border border-(--success)/20' : 'bg-(--danger)/10 border border-(--danger)/20'
      }`}>
        {result.type === 'liar' && (
          result.wasCorrect ? (
            <p className="text-base font-bold text-(--success)">
              ✅ The bid was a lie! {result.loserName} loses a ❤️
            </p>
          ) : (
            <p className="text-base font-bold text-(--danger)">
              ❌ The bid was true! {result.loserName} loses a ❤️
            </p>
          )
        )}

        {result.type === 'spotOn' && (
          result.wasCorrect ? (
            <p className="text-base font-bold text-(--success)">
              🎯 Spot on! Everyone else loses a ❤️
            </p>
          ) : (
            <p className="text-base font-bold text-(--danger)">
              ❌ Not exact! {result.loserName} loses a ❤️
            </p>
          )
        )}

        {myId && (
          <p className="text-sm text-(--text-secondary) mt-1">
            {iWon ? '🎉 You survived this round!' : '😅 Better luck next time!'}
          </p>
        )}
      </div>
    </div>
  );
}
