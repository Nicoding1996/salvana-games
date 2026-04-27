'use client';

import type { Room } from '@/types/hub';
import { useStoryThief } from '@/lib/games/story-thief/useStoryThief';
import WriteStory from './WriteStory';
import StoryReveal from './StoryReveal';
import QuestionPhase from './QuestionPhase';
import VotingPhase from './VotingPhase';
import ResultPhase from './ResultPhase';
import ReplacementPhase from './ReplacementPhase';
import GameSummary from './GameSummary';

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

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--border)">
        <div className="text-xs text-(--text-muted)">
          R<span className="text-(--text-primary) font-medium">{gameState.roundNumber || '—'}</span>
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
        <div className="text-xs">
          <span className="font-medium" style={{ color: myTeam?.color }}>{myTeamScore}</span>
          <span className="text-(--text-muted)"> pts</span>
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
          />
        )}

        {gameState.phase === 'reveal' && (
          <StoryReveal
            story={gameState.currentStory || ''}
            bluffingTeamMembers={gameState.bluffingTeamMembers}
            isOnBluffingTeam={isOnBluffingTeam}
            isMyStory={gameState.isMyStory}
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
          />
        )}

        {gameState.phase === 'voting' && (
          <VotingPhase
            story={gameState.currentStory || ''}
            bluffingTeamMembers={gameState.bluffingTeamMembers}
            isOnBluffingTeam={isOnBluffingTeam}
            hasVoted={gameState.hasVoted}
            onVote={storyThief.submitVote}
          />
        )}

        {gameState.phase === 'result' && (
          <ResultPhase
            voteResult={storyThief.lastVoteResult}
            room={room}
            isHost={isHost}
            needsReplacement={gameState.needsReplacement}
            onSubmitReplacement={storyThief.submitReplacement}
            onNextRound={storyThief.nextRound}
            onEndGame={storyThief.endGame}
            category={gameState.storyCategory}
            scores={gameState.scores}
            teamScores={gameState.teamScores}
            playerId={playerId}
            roundNumber={gameState.roundNumber}
          />
        )}

        {gameState.phase === 'replacement' && (
          <ReplacementPhase
            needsReplacement={gameState.needsReplacement}
            onSubmit={storyThief.submitReplacement}
            category={gameState.storyCategory}
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
    </div>
  );
}
