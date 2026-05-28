'use client';

import { useState, useEffect } from 'react';
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
  const [phase, setPhase] = useState<'announcement' | 'counting' | 'result'>('announcement');
  const [revealedPlayers, setRevealedPlayers] = useState<number>(0);
  const [runningCount, setRunningCount] = useState(0);
  const [showResult, setShowResult] = useState(false);

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

  // Get ordered player list for reveal
  const revealPlayers = players.filter(p => p.alive || result.allDice[p.id]);
  const playerDiceEntries = revealPlayers
    .map(p => ({ player: p, dice: result.allDice[p.id] || [] }))
    .filter(e => e.dice.length > 0);

  // Staggered reveal animation
  useEffect(() => {
    // Phase 1: Announcement (1.5s dramatic pause)
    const announcementTimer = setTimeout(() => {
      setPhase('counting');
    }, 1500);

    return () => clearTimeout(announcementTimer);
  }, []);

  // Phase 2: Staggered player dice reveal
  useEffect(() => {
    if (phase !== 'counting') return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    playerDiceEntries.forEach((entry, index) => {
      const timer = setTimeout(() => {
        setRevealedPlayers(index + 1);
        // Count matching dice for this player
        const matchCount = entry.dice.filter(d => dieCountsForBid(d)).length;
        setRunningCount(prev => prev + matchCount);
      }, (index + 1) * 800); // 800ms between each player reveal
      timers.push(timer);
    });

    // After all revealed, show result
    const resultTimer = setTimeout(() => {
      setPhase('result');
      setShowResult(true);
    }, (playerDiceEntries.length + 1) * 800 + 500);
    timers.push(resultTimer);

    return () => timers.forEach(t => clearTimeout(t));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="flex-1 flex flex-col items-center gap-4 p-4 overflow-y-auto" data-game="liars-dice">
      {showResult && iWon && <Confetti />}

      {/* Phase 1: Dramatic announcement */}
      <div className={`text-center pt-4 transition-all duration-300 ${
        phase === 'announcement' ? 'animate-slam-in' : ''
      }`}>
        {result.type === 'liar' ? (
          <div className="space-y-2">
            <p className="text-sm text-(--text-secondary)">
              {callerPlayer?.avatar} {callerPlayer?.name}
            </p>
            <h2 className="text-3xl font-black text-(--danger) tracking-tight animate-shake-once">
              LIAR!
            </h2>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-(--text-secondary)">
              {callerPlayer?.avatar} {callerPlayer?.name}
            </p>
            <h2 className="text-3xl font-black text-(--game-secondary) tracking-tight">
              SPOT ON!
            </h2>
          </div>
        )}
      </div>

      {/* Bid being challenged — always visible */}
      <div className="bg-(--bg-card) border border-(--border) rounded-xl px-5 py-3 flex items-center gap-3 justify-center">
        <span className="text-xs text-(--text-muted)">Claim:</span>
        <span className="text-2xl font-bold text-(--text-primary)">{result.bid.quantity}</span>
        <span className="text-lg text-(--text-muted)">×</span>
        <DiceIcon value={bidFace} size={32} />
        <span className="text-xs text-(--text-muted)">by {bidderPlayer?.name}</span>
      </div>

      {/* Phase 2: Staggered dice reveal with running count */}
      {phase !== 'announcement' && (
        <div className="w-full max-w-sm space-y-2 animate-fade-in">
          {/* Running count header */}
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] uppercase tracking-wider text-(--text-muted)">Revealing dice...</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-(--text-muted)">Found:</span>
              <span className={`text-lg font-bold transition-all duration-300 ${
                runningCount >= result.bid.quantity ? 'text-(--success) scale-110' : 'text-(--text-primary)'
              }`}>
                {runningCount}
              </span>
              <span className="text-xs text-(--text-muted)">/ {result.bid.quantity}</span>
            </div>
          </div>

          {/* Player dice rows — revealed one by one */}
          {playerDiceEntries.map((entry, index) => {
            const isRevealed = index < revealedPlayers;
            const isLoser = entry.player.id === result.loserId ||
              (result.losersIfSpotOn?.includes(entry.player.id) ?? false);

            if (!isRevealed) {
              // Unrevealed — show hidden placeholder
              return (
                <div
                  key={entry.player.id}
                  className="rounded-xl p-2.5 flex items-center gap-2 bg-(--bg-elevated)/50 border border-(--border)/50"
                >
                  <div className="flex flex-col items-center min-w-[44px]">
                    <span className="text-lg">{entry.player.avatar}</span>
                    <span className="text-[10px] text-(--text-muted) truncate max-w-[44px]">
                      {entry.player.id === myId ? 'You' : entry.player.name}
                    </span>
                  </div>
                  <div className="flex gap-1.5 flex-1 justify-end">
                    {entry.dice.map((_, i) => (
                      <DiceIcon key={i} value={1} size={28} hidden />
                    ))}
                  </div>
                </div>
              );
            }

            // Revealed — show actual dice with stagger
            return (
              <div
                key={entry.player.id}
                className={`rounded-xl p-2.5 flex items-center gap-2 transition-all animate-fade-in ${
                  isLoser && showResult
                    ? 'bg-(--danger)/10 border border-(--danger)/20'
                    : 'bg-(--bg-elevated) border border-(--border)'
                }`}
              >
                <div className="flex flex-col items-center min-w-[44px]">
                  <span className="text-lg">{entry.player.avatar}</span>
                  <span className="text-[10px] text-(--text-secondary) truncate max-w-[44px]">
                    {entry.player.id === myId ? 'You' : entry.player.name}
                  </span>
                </div>
                <div className="flex gap-1.5 flex-1 justify-end flex-wrap">
                  {entry.dice.map((val, i) => (
                    <div
                      key={i}
                      style={{ animationDelay: `${i * 150}ms` }}
                      className="animate-dice-reveal"
                    >
                      <DiceIcon
                        value={val}
                        size={28}
                        highlighted={dieCountsForBid(val)}
                        wild={settings.wildOnes}
                      />
                    </div>
                  ))}
                </div>
                {/* Match count for this player */}
                <div className="flex flex-col items-center min-w-[24px]">
                  <span className={`text-sm font-bold ${
                    entry.dice.filter(d => dieCountsForBid(d)).length > 0
                      ? 'text-(--game-accent)'
                      : 'text-(--text-muted)'
                  }`}>
                    {entry.dice.filter(d => dieCountsForBid(d)).length}
                  </span>
                </div>
                {isLoser && showResult && <span className="text-sm shrink-0">💔</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Phase 3: Final result */}
      {showResult && (
        <div className={`text-center py-3 px-5 rounded-xl w-full max-w-sm animate-celebrate ${
          result.wasCorrect ? 'bg-(--success)/10 border border-(--success)/20' : 'bg-(--danger)/10 border border-(--danger)/20'
        }`}>
          {/* Big verdict */}
          <div className="mb-2">
            <div className="flex items-center justify-center gap-3">
              <span className={`text-3xl font-bold ${
                result.actualCount >= result.bid.quantity ? 'text-(--success)' : 'text-(--danger)'
              }`}>
                {result.actualCount}
              </span>
              <span className="text-lg text-(--text-muted)">vs</span>
              <span className="text-3xl font-bold text-(--text-primary)">
                {result.bid.quantity}
              </span>
            </div>
            <p className="text-xs text-(--text-muted) mt-1">
              actual {DIE_FACE_LABELS[bidFace]} vs claimed
              {settings.wildOnes && bidFace !== 1 && ' (incl. wild ⚀)'}
            </p>
          </div>

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
      )}
    </div>
  );
}
