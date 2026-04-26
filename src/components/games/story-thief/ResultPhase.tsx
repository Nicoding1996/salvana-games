'use client';

import { useState, useEffect } from 'react';
import type { VoteResult } from '@/types/socket-events';
import type { Room } from '@/types/hub';
import Confetti from '@/components/shared/Confetti';

interface Props {
  voteResult: VoteResult | null;
  room: Room;
  isHost: boolean;
  needsReplacement: boolean;
  onSubmitReplacement: (text: string) => void;
  onNextRound: () => void;
  onEndGame: () => void;
  category: string | null;
  scores: Record<string, number>;
  teamScores: Record<string, number>;
  playerId: string;
  roundNumber: number;
}

export default function ResultPhase({
  voteResult, room, isHost, needsReplacement,
  onSubmitReplacement, onNextRound, onEndGame, category,
  teamScores, playerId, roundNumber,
}: Props) {
  const [replacementText, setReplacementText] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowDetails(true), 3500);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmitReplacement = () => {
    if (replacementText.trim()) {
      onSubmitReplacement(replacementText.trim());
      // Don't clear text yet — wait for server confirmation (needsReplacement becomes false)
    }
  };

  // Server confirmed replacement was received — clear the text
  const replacementAccepted = !needsReplacement && replacementText.trim().length > 0;
  useEffect(() => {
    if (replacementAccepted) {
      setReplacementText('');
    }
  }, [replacementAccepted]);

  if (!voteResult) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-(--text-muted) animate-soft-pulse">Calculating...</p>
      </div>
    );
  }

  const author = room.players[voteResult.realAuthorId];
  const totalVotes = Object.keys(voteResult.votes).length;
  const correctVotes = Object.values(voteResult.votes).filter(v => v === voteResult.realAuthorId).length;
  const bluffersWon = totalVotes > 0 && correctVotes <= totalVotes / 2;

  // Did THIS player guess correctly?
  const myVote = voteResult.votes[playerId];
  const iGuessedRight = myVote === voteResult.realAuthorId;
  const iWasBluffing = room.players[playerId]?.teamId === room.teams.find(t =>
    t.playerIds.includes(voteResult.realAuthorId)
  )?.id;

  // Show confetti if my team won this round
  const myTeamId = room.players[playerId]?.teamId;
  const myTeamWon = myTeamId ? (voteResult.teamPointsAwarded[myTeamId] || 0) > 0 : false;

  const sortedTeams = room.teams
    .map(t => ({ ...t, score: teamScores[t.id] || 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      {/* Confetti for winners */}
      {myTeamWon && <Confetti />}

      {/* Big reveal */}
      <div className="text-center pt-6 mb-2">
        <div className="animate-celebrate">
          <div className="text-6xl mb-3">{author?.avatar || '❓'}</div>
        </div>
        <h2 className="text-2xl font-bold mb-1 animate-fade-in">
          It was {voteResult.realAuthorName}!
        </h2>
        <p className="text-(--text-muted) text-sm animate-fade-in">
          {correctVotes}/{totalVotes} guessed correctly
        </p>

        {/* Win/lose badge */}
        <div className="mt-3 animate-slide-up" style={{ animationDelay: '0.3s', animationFillMode: 'backwards' }}>
          {iWasBluffing ? (
            <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-medium ${
              bluffersWon
                ? 'bg-(--success-dim) text-(--success) border border-(--success)/20'
                : 'bg-(--danger-dim) text-(--danger) border border-(--danger)/20'
            }`}>
              {bluffersWon ? '🎭 Your team fooled them!' : '😬 They figured it out'}
            </span>
          ) : (
            <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-medium ${
              iGuessedRight
                ? 'bg-(--success-dim) text-(--success) border border-(--success)/20'
                : 'bg-(--danger-dim) text-(--danger) border border-(--danger)/20'
            }`}>
              {iGuessedRight ? '🎉 You got it right!' : '😅 You were fooled'}
            </span>
          )}
        </div>
      </div>

      {/* Share prompt */}
      <p className="text-center text-(--text-muted) text-xs italic my-3">
        {voteResult.realAuthorName}, share the full story? 🎤
      </p>

      {/* Details — delayed */}
      {showDetails && (
        <>
          {/* Vote breakdown — who voted for whom */}
          <div className="bg-(--bg-card) border border-(--border) rounded-xl p-3.5 mb-2.5 animate-slide-up">
            <p className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted) mb-2">Votes</p>
            <div className="space-y-1">
              {Object.entries(voteResult.votes).map(([voterId, suspectId]) => {
                const voter = room.players[voterId];
                const suspect = room.players[suspectId];
                const isCorrect = suspectId === voteResult.realAuthorId;
                return (
                  <div key={voterId} className="flex items-center gap-2 text-sm">
                    <span>{voter?.avatar}</span>
                    <span className="text-(--text-secondary)">{voter?.name}</span>
                    <span className="text-(--text-muted)">→</span>
                    <span className={isCorrect ? 'text-(--success) font-medium' : 'text-(--danger)'}>{suspect?.name}</span>
                    <span className="text-xs">{isCorrect ? '✓' : '✗'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Round result */}
          <div className="bg-(--bg-card) border border-(--border) rounded-xl p-3.5 mb-2.5 animate-slide-up">
            <p className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted) mb-2">Round</p>
            {room.teams
              .map(t => ({ ...t, pts: voteResult.teamPointsAwarded[t.id] || 0 }))
              .sort((a, b) => b.pts - a.pts)
              .map((team) => (
                <div key={team.id} className="flex items-center justify-between text-sm py-0.5">
                  <span style={{ color: team.color }}>{team.name}</span>
                  <span className="font-semibold" style={{ color: team.pts > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {team.pts > 0 ? `+${team.pts}` : '—'}
                  </span>
                </div>
              ))}
          </div>

          {/* Standings */}
          <div className="bg-(--bg-card) border border-(--border) rounded-xl p-3.5 mb-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <p className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted) mb-2">Standings</p>
            {sortedTeams.map((team, i) => (
              <div key={team.id} className="flex items-center justify-between text-sm py-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <span style={{ color: team.color }}>{team.name}</span>
                </div>
                <span className="font-bold">{team.score}</span>
              </div>
            ))}
          </div>

          {/* Replacement */}
          {needsReplacement && (
            <div className="bg-(--bg-card) border border-(--game-accent)/20 rounded-xl p-3.5 mb-3 animate-slide-up">
              <p className="text-sm font-medium mb-1.5">✍️ Write your next story</p>
              {category && <p className="text-xs text-(--game-accent) mb-2">{category}</p>}
              <textarea
                value={replacementText}
                onChange={(e) => setReplacementText(e.target.value)}
                placeholder="Another true story..."
                className="w-full min-h-[90px] p-3 bg-(--bg-secondary) border border-(--border) rounded-lg text-sm outline-none focus:border-(--game-accent) transition-colors resize-none mb-2 placeholder:text-(--text-muted)"
                autoFocus
              />
              <button
                onClick={handleSubmitReplacement}
                disabled={!replacementText.trim()}
                className="w-full py-2.5 bg-(--game-accent) text-(--bg-primary) rounded-lg font-medium text-sm disabled:opacity-30 transition-all active:scale-[0.97]"
              >
                Submit
              </button>
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="mt-auto pb-4 space-y-2">
        {isHost && showDetails && (
          <>
            {/* Fairness hint */}
            {roundNumber > 0 && roundNumber % room.teams.length === 0 && (
              <p className="text-center text-xs text-(--game-accent) mb-2 animate-fade-in">
                ✨ Each team has bluffed {roundNumber / room.teams.length} time{roundNumber / room.teams.length !== 1 ? 's' : ''} — good stopping point!
              </p>
            )}
            <button
              onClick={onNextRound}
              disabled={needsReplacement}
              className="w-full py-3.5 bg-(--game-accent) text-(--bg-primary) disabled:opacity-30 rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
            >
              {needsReplacement ? '⏳ Waiting for story...' : '▶ Next Round'}
            </button>
            <button
              onClick={() => {
                if (confirmEnd) {
                  onEndGame();
                } else {
                  setConfirmEnd(true);
                  setTimeout(() => setConfirmEnd(false), 3000);
                }
              }}
              className={`w-full py-2 text-xs transition-colors ${
                confirmEnd ? 'text-(--danger) font-medium' : 'text-(--text-muted)'
              }`}
            >
              {confirmEnd ? 'Tap again to end game' : 'End Game'}
            </button>
          </>
        )}
        {isHost && !showDetails && (
          <p className="text-center text-xs text-(--text-muted)">🎤</p>
        )}
        {!isHost && (
          <p className="text-center text-xs text-(--text-muted)">
            {showDetails ? 'Waiting for host...' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
