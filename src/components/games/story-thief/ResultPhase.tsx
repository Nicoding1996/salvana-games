'use client';

import { useState, useEffect } from 'react';
import type { VoteResult } from '@/types/socket-events';
import type { Room } from '@/types/hub';

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
}

export default function ResultPhase({
  voteResult, room, isHost, needsReplacement,
  onSubmitReplacement, onNextRound, onEndGame, category,
  scores, teamScores,
}: Props) {
  const [replacementText, setReplacementText] = useState('');
  const [replacementSubmitted, setReplacementSubmitted] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);

  // After 4 seconds, show the scoreboard section (give time for the reveal moment)
  useEffect(() => {
    const timer = setTimeout(() => setShowScoreboard(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmitReplacement = () => {
    if (replacementText.trim()) {
      onSubmitReplacement(replacementText.trim());
      setReplacementSubmitted(true);
    }
  };

  if (!voteResult) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-(--text-secondary)">Calculating results...</p>
      </div>
    );
  }

  const author = room.players[voteResult.realAuthorId];
  const totalVotes = Object.keys(voteResult.votes).length;
  const correctVotes = Object.values(voteResult.votes).filter(v => v === voteResult.realAuthorId).length;
  const bluffersWon = correctVotes <= totalVotes / 2;

  // Sort teams by score
  const sortedTeams = room.teams
    .map(t => ({ ...t, score: teamScores[t.id] || 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto">
      {/* Big reveal moment */}
      <div className="text-center mb-2 animate-card-flip">
        <div className="text-6xl mb-3">{author?.avatar || '❓'}</div>
        <h2 className="text-2xl font-bold mb-1">
          It was {voteResult.realAuthorName}!
        </h2>
        <p className="text-(--text-secondary) text-sm">
          {correctVotes} / {totalVotes} guessed correctly
        </p>
        <p className="text-lg mt-2">
          {bluffersWon ? '🎭 Bluffers win this round!' : '🔍 Detectives cracked it!'}
        </p>
      </div>

      {/* Prompt to share the story — the social moment */}
      <div className="text-center py-3 mb-4 animate-fade-in">
        <p className="text-(--text-secondary) text-sm italic">
          {voteResult.realAuthorName}, want to share the full story? 🎤
        </p>
      </div>

      {/* Points this round */}
      <div className="bg-(--bg-card) rounded-2xl p-4 mb-3 animate-slide-up">
        <h3 className="text-xs font-semibold text-(--text-secondary) mb-2 uppercase tracking-wider">Points This Round</h3>
        <div className="space-y-1">
          {Object.entries(voteResult.pointsAwarded)
            .filter(([, pts]) => pts > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([pid, pts]) => (
              <div key={pid} className="flex items-center justify-between text-sm">
                <span>
                  {room.players[pid]?.avatar} {room.players[pid]?.name || 'Unknown'}
                </span>
                <span className="text-(--accent) font-bold">+{pts}</span>
              </div>
            ))}
          {Object.entries(voteResult.pointsAwarded).filter(([, pts]) => pts > 0).length === 0 && (
            <p className="text-xs text-(--text-secondary)">No points awarded this round</p>
          )}
        </div>
      </div>

      {/* Team standings — appears after delay */}
      {showScoreboard && (
        <div className="bg-(--bg-card) rounded-2xl p-4 mb-3 animate-slide-up">
          <h3 className="text-xs font-semibold text-(--text-secondary) mb-2 uppercase tracking-wider">Team Standings</h3>
          <div className="space-y-2">
            {sortedTeams.map((team, i) => (
              <div key={team.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <span className="text-sm font-medium" style={{ color: team.color }}>{team.name}</span>
                </div>
                <span className="font-bold">{team.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Replacement story (for the author) */}
      {needsReplacement && !replacementSubmitted && showScoreboard && (
        <div className="bg-(--bg-card) rounded-2xl p-4 mb-3 animate-slide-up">
          <h3 className="text-sm font-semibold mb-2">✍️ Write Your Next Story</h3>
          {category && (
            <p className="text-xs text-(--accent) mb-2">💡 Suggestion: {category}</p>
          )}
          <textarea
            value={replacementText}
            onChange={(e) => setReplacementText(e.target.value)}
            placeholder="Write another true story about yourself..."
            className="w-full min-h-[100px] p-3 bg-(--bg-secondary) rounded-xl text-sm outline-none focus:ring-1 focus:ring-(--accent) resize-none mb-2"
            autoFocus
          />
          <button
            onClick={handleSubmitReplacement}
            disabled={!replacementText.trim()}
            className="w-full py-3 bg-(--accent) rounded-xl font-semibold disabled:opacity-50 transition-all active:scale-95"
          >
            Submit Story
          </button>
        </div>
      )}

      {needsReplacement && replacementSubmitted && (
        <div className="text-center text-sm text-(--text-secondary) mb-3 animate-fade-in">
          ✅ Replacement story submitted!
        </div>
      )}

      {/* Next round / End game — host controls */}
      <div className="mt-auto pb-4 space-y-2">
        {isHost && showScoreboard && (
          <>
            <button
              onClick={onNextRound}
              disabled={needsReplacement && !replacementSubmitted}
              className="w-full py-4 bg-(--accent) hover:bg-[#d63d56] disabled:opacity-50 rounded-2xl text-lg font-semibold transition-all active:scale-95"
            >
              {needsReplacement && !replacementSubmitted
                ? '⏳ Waiting for replacement story...'
                : '▶ Next Round'}
            </button>
            <button
              onClick={onEndGame}
              className="w-full py-3 text-(--text-secondary) text-sm"
            >
              End Game
            </button>
          </>
        )}
        {isHost && !showScoreboard && (
          <p className="text-center text-sm text-(--text-secondary) animate-fade-in">
            Let the moment breathe... 🎤
          </p>
        )}
        {!isHost && (
          <p className="text-center text-sm text-(--text-secondary)">
            {showScoreboard ? 'Waiting for host to start next round...' : 'Enjoy the moment! 🎉'}
          </p>
        )}
      </div>
    </div>
  );
}
