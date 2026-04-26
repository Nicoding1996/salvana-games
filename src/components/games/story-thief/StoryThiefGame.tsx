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
}

export default function StoryThiefGame({ room, playerId, isHost }: Props) {
  const storyThief = useStoryThief();
  const { gameState } = storyThief;

  const myTeamId = room.players[playerId]?.teamId;
  const isOnBluffingTeam = myTeamId === gameState.bluffingTeamId;

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-(--bg-card)">
        <div className="text-sm">
          <span className="text-(--text-secondary)">Round </span>
          <span className="font-bold">{gameState.roundNumber}</span>
        </div>
        <div className="text-sm font-mono text-(--text-secondary)">{room.code}</div>
        <div className="text-sm">
          <span className="text-(--text-secondary)">Score </span>
          <span className="font-bold">{gameState.scores[playerId] || 0}</span>
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
          />
        )}
      </div>
    </div>
  );
}
