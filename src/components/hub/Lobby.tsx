'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { useRoom } from '@/lib/hub/useRoom';
import type { RoundMode } from '@/types/hub';
import type { LiarsDiceSettings } from '@/types/games/liars-dice';
import { DEFAULT_LIARS_DICE_SETTINGS } from '@/types/games/liars-dice';
import QRCode from '@/components/shared/QRCode';

interface LobbyProps {
  roomHook: ReturnType<typeof useRoom>;
}

const GAMES = [
  { id: 'story-thief', name: "Whose Truth?", icon: '📜', tagline: 'Bluff with stories', minPlayers: 4, maxPlayers: 18 },
  { id: 'liars-dice', name: "Liar's Dice", icon: '🎲', tagline: 'Bluff with dice', minPlayers: 2, maxPlayers: 6 },
] as const;

export default function Lobby({ roomHook }: LobbyProps) {
  const { room, playerId, isHost, updateSettings, assignTeam, shuffleTeams, startGame, leaveRoom } = roomHook;
  const [showQR, setShowQR] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string>('story-thief');
  const [diceSettings, setDiceSettings] = useState<LiarsDiceSettings>({ ...DEFAULT_LIARS_DICE_SETTINGS });
  const router = useRouter();
  if (!room) return null;

  const playerCount = Object.keys(room.players).length;
  const selectedGameDef = GAMES.find(g => g.id === selectedGame)!;
  const isLiarsDice = selectedGame === 'liars-dice';
  const tooManyForDice = isLiarsDice && playerCount > diceSettings.maxPlayers;
  const canStart = playerCount >= selectedGameDef.minPlayers && !tooManyForDice;
  const roomUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${room.code}` : '';

  const handleLeave = () => {
    leaveRoom();
    router.push('/');
  };

  const handleJoinTeam = (teamId: string) => {
    if (!playerId) return;
    assignTeam(playerId, teamId);
  };

  const handleStart = () => {
    if (isLiarsDice) {
      startGame('liars-dice', diceSettings);
    } else {
      startGame('story-thief');
    }
  };

  const playersNeeded = selectedGameDef.minPlayers - playerCount;

  return (
    <div className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">
      {/* Room Code — tap to show QR */}
      <div className="text-center mb-6 animate-fade-in">
        <p className="text-[10px] uppercase tracking-[0.2em] text-(--text-muted) mb-1">Room Code</p>
        <button
          onClick={() => setShowQR(!showQR)}
          className="text-3xl font-mono font-bold tracking-[0.3em] text-(--brand) hover:text-(--game-accent-strong) transition-colors"
          aria-label={showQR ? 'Hide QR code' : 'Show QR code'}
        >
          {room.code}
        </button>
        <p className="text-xs text-(--text-muted) mt-1.5">
          {playerCount} player{playerCount !== 1 ? 's' : ''} · tap code for QR
        </p>

        {/* QR Code */}
        {showQR && roomUrl && (
          <div className="mt-4 flex flex-col items-center gap-2 animate-slide-up">
            <div className="bg-(--bg-card) border border-(--border) rounded-xl p-3">
              <QRCode value={roomUrl} size={160} />
            </div>
            <p className="text-[10px] text-(--text-muted) max-w-[200px] break-all">{roomUrl}</p>
          </div>
        )}
      </div>

      {/* Game Selector (Host only) */}
      {isHost && (
        <div className="flex gap-2 mb-4">
          {GAMES.map((game) => (
            <button
              key={game.id}
              onClick={() => setSelectedGame(game.id)}
              className={`flex-1 py-3 px-3 rounded-xl text-center transition-all active:scale-[0.97] ${
                selectedGame === game.id
                  ? 'bg-(--bg-elevated) ring-2 ring-(--brand) border border-(--brand)/30'
                  : 'bg-(--bg-card) border border-(--border) opacity-60'
              }`}
            >
              <span className="text-2xl block">{game.icon}</span>
              <span className="text-xs font-medium text-(--text-primary) block mt-1">{game.name}</span>
              <span className="text-[10px] text-(--text-muted) block">{game.tagline}</span>
            </button>
          ))}
        </div>
      )}

      {/* Non-host game indicator */}
      {!isHost && (
        <div className="text-center mb-4">
          <p className="text-xs text-(--text-muted)">Host is choosing the game...</p>
        </div>
      )}

      {/* Shuffle button — only for team games */}
      {isHost && !isLiarsDice && (
        <div className="flex justify-end mb-2">
          <button
            onClick={shuffleTeams}
            className="text-xs px-3 py-1.5 rounded-lg border border-(--border) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--brand)/40 transition-colors active:scale-95"
          >
            🔀 Shuffle
          </button>
        </div>
      )}

      {/* Teams — hidden for Liar's Dice */}
      {!isLiarsDice && (
        <div className="space-y-2.5 mb-5 flex-1 overflow-y-auto">
          {room.teams.map((team) => {
            const myTeam = room.players[playerId || '']?.teamId === team.id;
            return (
              <div
                key={team.id}
                className={`bg-(--bg-card) rounded-xl p-3.5 transition-all ${
                  myTeam ? 'ring-1 ring-(--brand)/50' : 'border border-(--border)'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team.color }} />
                    <h3 className="font-medium text-sm" style={{ color: team.color }}>
                      {team.name}
                    </h3>
                    <span className="text-xs text-(--text-muted)">({team.playerIds.length})</span>
                  </div>
                  {!myTeam && (
                    <button
                      onClick={() => handleJoinTeam(team.id)}
                      className="text-xs px-2.5 py-1 rounded-md border border-(--border) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--brand)/40 transition-colors active:scale-95"
                      aria-label={`Join ${team.name}`}
                    >
                      Join
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {team.playerIds.map((pid) => {
                    const player = room.players[pid];
                    if (!player) return null;
                    return (
                      <div key={pid} className="flex items-center gap-2 text-sm py-0.5">
                        <span>{player.avatar}</span>
                        <span className={player.connected ? 'text-(--text-primary)' : 'text-(--text-muted)'}>
                          {player.name}
                        </span>
                        {player.isHost && <span className="text-(--brand) text-xs">host</span>}
                        {!player.connected && <span className="text-(--text-muted) text-xs">offline</span>}
                      </div>
                    );
                  })}
                  {team.playerIds.length === 0 && (
                    <p className="text-xs text-(--text-muted) py-1">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Player list for Liar's Dice (no teams) */}
      {isLiarsDice && (
        <div className="bg-(--bg-card) border border-(--border) rounded-xl p-3.5 mb-5 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm text-(--text-primary)">Players</h3>
            <span className="text-xs text-(--text-muted)">
              {playerCount}/{diceSettings.maxPlayers}
            </span>
          </div>
          <div className="space-y-0.5">
            {Object.values(room.players).map((player) => (
              <div key={player.id} className="flex items-center gap-2 text-sm py-0.5">
                <span>{player.avatar}</span>
                <span className={player.connected ? 'text-(--text-primary)' : 'text-(--text-muted)'}>
                  {player.name}
                </span>
                {player.isHost && <span className="text-(--brand) text-xs">host</span>}
                {!player.connected && <span className="text-(--text-muted) text-xs">offline</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings (Host only) */}
      {isHost && !isLiarsDice && (
        <div className="bg-(--bg-card) border border-(--border) rounded-xl p-4 mb-4">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted) mb-3">Settings</h3>

          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-(--text-secondary)">Teams</span>
            <div className="flex gap-1.5">
              {([2, 3] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => updateSettings({ teamCount: n })}
                  className={`px-3.5 py-1.5 rounded-lg text-sm transition-all ${
                    room.settings.teamCount === n
                      ? 'bg-(--brand) text-(--bg-primary) font-medium'
                      : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border)'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-(--text-secondary)">Mode</span>
            <div className="flex gap-1.5">
              {([
                { value: 'timed' as RoundMode, label: '⏱ Timed' },
                { value: 'freeFlow' as RoundMode, label: '🌊 Free' },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateSettings({ roundMode: value })}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    room.settings.roundMode === value
                      ? 'bg-(--brand) text-(--bg-primary) font-medium'
                      : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border)'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {room.settings.roundMode === 'timed' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-(--text-secondary)">Timer</span>
              <div className="flex gap-1.5">
                {[30, 60, 90, 120].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateSettings({ timerSeconds: s })}
                    className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                      room.settings.timerSeconds === s
                        ? 'bg-(--brand) text-(--bg-primary) font-medium'
                        : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border)'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Liar's Dice Settings (Host only) */}
      {isHost && isLiarsDice && (
        <div className="bg-(--bg-card) border border-(--border) rounded-xl p-4 mb-4">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-(--text-muted) mb-3">Dice Settings</h3>

          {/* Lives */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-(--text-secondary)">Lives</span>
            <div className="flex gap-1.5">
              {([2, 3] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setDiceSettings(s => ({ ...s, lives: n }))}
                  className={`px-3.5 py-1.5 rounded-lg text-sm transition-all ${
                    diceSettings.lives === n
                      ? 'bg-(--brand) text-(--bg-primary) font-medium'
                      : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border)'
                  }`}
                >
                  {'❤️'.repeat(n)}
                </button>
              ))}
            </div>
          </div>

          {/* Turn Timer */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-(--text-secondary)">Turn Timer</span>
            <div className="flex gap-1.5">
              {([15, 30, 45, 0] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setDiceSettings(prev => ({ ...prev, turnTimer: s }))}
                  className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    diceSettings.turnTimer === s
                      ? 'bg-(--brand) text-(--bg-primary) font-medium'
                      : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border)'
                  }`}
                >
                  {s === 0 ? 'Off' : `${s}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Wild 1s */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm text-(--text-secondary)">Wild ⚀</span>
              <p className="text-[10px] text-(--text-muted)">1s count as any face</p>
            </div>
            <button
              onClick={() => setDiceSettings(s => ({ ...s, wildOnes: !s.wildOnes }))}
              className={`px-3.5 py-1.5 rounded-lg text-sm transition-all ${
                diceSettings.wildOnes
                  ? 'bg-(--brand) text-(--bg-primary) font-medium'
                  : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border)'
              }`}
            >
              {diceSettings.wildOnes ? 'On' : 'Off'}
            </button>
          </div>

          {/* Spot On */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-(--text-secondary)">Spot On 🎯</span>
              <p className="text-[10px] text-(--text-muted)">Call exact bid</p>
            </div>
            <button
              onClick={() => setDiceSettings(s => ({ ...s, spotOn: !s.spotOn }))}
              className={`px-3.5 py-1.5 rounded-lg text-sm transition-all ${
                diceSettings.spotOn
                  ? 'bg-(--brand) text-(--bg-primary) font-medium'
                  : 'bg-(--bg-secondary) text-(--text-secondary) border border-(--border)'
              }`}
            >
              {diceSettings.spotOn ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      )}

      {/* Start / Wait */}
      <div className="space-y-2 pb-4">
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full py-4 bg-(--game-accent) text-(--bg-primary) disabled:opacity-30 rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
          >
            {canStart
              ? `${selectedGameDef.icon} Start ${selectedGameDef.name}`
              : tooManyForDice
                ? `Too many players (max ${diceSettings.maxPlayers})`
                : `Need ${playersNeeded} more player${playersNeeded !== 1 ? 's' : ''}`
            }
          </button>
        ) : (
          <div className="text-center py-4 text-(--text-muted) text-sm animate-soft-pulse">
            Waiting for host...
          </div>
        )}

        <button
          onClick={handleLeave}
          className="w-full py-2.5 text-(--text-muted) text-xs hover:text-(--text-secondary) transition-colors"
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}
