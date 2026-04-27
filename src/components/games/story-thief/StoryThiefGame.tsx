'use client';

import { useState, useEffect } from 'react';
import type { Room } from '@/types/hub';
import { useStoryThief } from '@/lib/games/story-thief/useStoryThief';
import WriteStory from './WriteStory';
import StoryReveal from './StoryReveal';
import QuestionPhase from './QuestionPhase';
import VotingPhase from './VotingPhase';
import ResultPhase from './ResultPhase';
import GameSummary from './GameSummary';

function WaitingForStory({ needsReplacement, isHost, onEndGame }: {
  needsReplacement: boolean;
  isHost: boolean;
  onEndGame: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
      <div className="text-4xl mb-4">⏳</div>
      <h2 className="text-lg font-semibold mb-1">Waiting for story</h2>
      <p className="text-(--text-muted) text-sm text-center mb-6">
        {needsReplacement
          ? 'Write your replacement story below to continue!'
          : 'A player needs to finish writing their replacement story before the next round can start.'}
      </p>
      {isHost && (
        <button
          onClick={() => {
            if (confirmEnd) {
              onEndGame();
            } else {
              setConfirmEnd(true);
              setTimeout(() => setConfirmEnd(false), 3000);
            }
          }}
          className={`text-xs transition-colors ${
            confirmEnd ? 'text-(--danger) font-medium' : 'text-(--text-muted)'
          }`}
        >
          {confirmEnd ? 'Tap again to end game' : 'End Game'}
        </button>
      )}
    </div>
  );
}

interface Props {
  room: Room;
  playerId: string;
  isHost: boolean;
  onLeaveRoom: () => void;
}

export default function StoryThiefGame({ room, playerId, isHost, onLeaveRoom }: Props) {
  const storyThief = useStoryThief();
  const { gameState } = storyThief;

  const myTeamId = room.players[playerId]?.teamId;
  const isOnBluffingTeam = myTeamId === gameState.bluffingTeamId;
  const myTeam = room.teams.find(t => t.id === myTeamId);
  const myTeamScore = myTeamId ? (gameState.teamScores[myTeamId] || 0) : 0;
  const bluffingTeam = room.teams.find(t => t.id === gameState.bluffingTeamId);
  const isInGame = gameState.phase !== 'setup' && gameState.phase !== 'finished';

  // Floating replacement banner state
  const [replacementText, setReplacementText] = useState('');
  const [showReplacementForm, setShowReplacementForm] = useState(false);

  // Auto-show the form when player owes a replacement (after leaving result screen, or in waiting state)
  const owesReplacement = gameState.needsReplacement && (gameState.phase !== 'result' || gameState.waitingForReplacement);

  // Clear text when replacement is accepted by server
  useEffect(() => {
    if (!gameState.needsReplacement && replacementText.trim().length > 0) {
      setReplacementText('');
      setShowReplacementForm(false);
    }
  }, [gameState.needsReplacement, replacementText]);

  const handleSubmitReplacement = () => {
    if (replacementText.trim()) {
      storyThief.submitReplacement(replacementText.trim());
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--border)">
        <div className="text-xs flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: myTeam?.color }} />
          <span className="text-(--text-muted)">R</span>
          <span className="text-(--text-primary) font-medium">{gameState.roundNumber || '—'}</span>
        </div>
        {/* Bluffing team indicator — shown during active rounds */}
        {isInGame && bluffingTeam ? (
          <div className="text-xs flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: bluffingTeam.color }} />
            <span style={{ color: bluffingTeam.color }} className="font-medium">{bluffingTeam.name}</span>
            <span className="text-(--text-muted)">bluffs</span>
          </div>
        ) : (
          <div className="text-xs font-mono text-(--text-muted)">{room.code}</div>
        )}
        <div className="text-xs flex items-center gap-1">
          <span className="font-medium" style={{ color: myTeam?.color }}>{myTeamScore}</span>
          <span className="text-(--text-muted)">pts</span>
        </div>
      </div>

      {/* Game Phases */}
      <div className="flex-1 flex flex-col">
        {gameState.phase === 'setup' && (
          <WriteStory
            onSubmit={storyThief.submitStory}
            hasSubmitted={gameState.hasSubmittedStory}
            submittedCount={gameState.submittedPlayers.length}
            totalPlayers={gameState.totalPlayers}
            category={gameState.storyCategory}
            isFirstRound={gameState.roundNumber === 0}
            waitingOn={
              Object.values(room.players)
                .filter(p => p.connected && !gameState.submittedPlayers.includes(p.id))
                .map(p => ({ name: p.name, avatar: p.avatar }))
            }
          />
        )}

        {gameState.phase === 'reveal' && (
          <StoryReveal
            story={gameState.currentStory || ''}
            bluffingTeamMembers={gameState.bluffingTeamMembers}
            isOnBluffingTeam={isOnBluffingTeam}
            isMyStory={gameState.isMyStory}
            teamColor={bluffingTeam?.color}
          />
        )}

        {gameState.phase === 'questioning' && (
          <QuestionPhase
            story={gameState.currentStory || ''}
            bluffingTeamMembers={gameState.bluffingTeamMembers}
            isOnBluffingTeam={isOnBluffingTeam}
            isMyStory={gameState.isMyStory}
            hintCard={gameState.hintCard}
            timerSeconds={storyThief.timerSeconds}
            roundMode={room.settings.roundMode}
            onEndPhase={storyThief.endQuestionPhase}
            isHost={isHost}
            teamColor={bluffingTeam?.color}
          />
        )}

        {gameState.phase === 'voting' && (
          <VotingPhase
            story={gameState.currentStory || ''}
            bluffingTeamMembers={gameState.bluffingTeamMembers}
            isOnBluffingTeam={isOnBluffingTeam}
            hasVoted={gameState.hasVoted}
            onVote={storyThief.submitVote}
            teamColor={bluffingTeam?.color}
          />
        )}

        {gameState.phase === 'result' && !gameState.waitingForReplacement && (
          <ResultPhase
            voteResult={storyThief.lastVoteResult}
            room={room}
            isHost={isHost}
            onNextRound={storyThief.nextRound}
            onEndGame={storyThief.endGame}
            teamScores={gameState.teamScores}
            playerId={playerId}
            roundNumber={gameState.roundNumber}
            totalStoriesLeft={gameState.totalStoriesLeft}
          />
        )}

        {gameState.phase === 'result' && gameState.waitingForReplacement && (
          <WaitingForStory
            needsReplacement={gameState.needsReplacement}
            isHost={isHost}
            onEndGame={storyThief.endGame}
          />
        )}

        {gameState.phase === 'finished' && (
          <GameSummary
            scores={gameState.scores}
            teamScores={gameState.teamScores}
            room={room}
            isHost={isHost}
            onBackToLobby={storyThief.endGame}
            onLeaveRoom={onLeaveRoom}
          />
        )}
      </div>

      {/* Floating replacement banner — shown during any phase when player owes a story */}
      {owesReplacement && (
        <div className="absolute bottom-0 left-0 right-0 p-3 animate-slide-up">
          {showReplacementForm ? (
            <div className="bg-(--bg-card) border border-(--game-accent)/30 rounded-xl p-3 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">✍️ Write your next story</p>
                <button
                  onClick={() => setShowReplacementForm(false)}
                  className="text-(--text-muted) text-xs px-2 py-1"
                  aria-label="Minimize"
                >
                  ▾
                </button>
              </div>
              {gameState.storyCategory && (
                <p className="text-xs text-(--game-accent) mb-2">{gameState.storyCategory}</p>
              )}
              <textarea
                value={replacementText}
                onChange={(e) => setReplacementText(e.target.value)}
                placeholder="Another true story..."
                className="w-full min-h-[80px] p-3 bg-(--bg-elevated) border border-(--border) rounded-lg text-sm outline-none focus:border-(--game-accent) transition-colors resize-none mb-2 placeholder:text-(--text-muted)"
                aria-label="Write your replacement story"
              />
              <button
                onClick={handleSubmitReplacement}
                disabled={!replacementText.trim()}
                className="w-full py-2.5 bg-(--game-accent) text-(--bg-primary) rounded-lg font-medium text-sm disabled:opacity-30 transition-all active:scale-[0.97]"
              >
                Submit
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowReplacementForm(true)}
              className="w-full py-3 bg-(--bg-card) border border-(--game-accent)/30 rounded-xl text-sm font-medium text-(--game-accent) shadow-lg transition-all active:scale-[0.98]"
            >
              ✍️ Tap to write your next story
            </button>
          )}
        </div>
      )}
    </div>
  );
}
