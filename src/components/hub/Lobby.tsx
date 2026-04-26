'use client';

import type { useRoom } from '@/lib/hub/useRoom';
import type { RoundMode } from '@/types/hub';

interface LobbyProps {
  roomHook: ReturnType<typeof useRoom>;
}

export default function Lobby({ roomHook }: LobbyProps) {
  const { room, playerId, isHost, updateSettings, assignTeam, startGame, leaveRoom } = roomHook;
  if (!room) return null;

  const playerCount = Object.keys(room.players).length;
  const canStart = playerCount >= 4;

  const handleJoinTeam = (teamId: string) => {
    if (!playerId) return;
    // Any player can switch their own team by emitting assignTeam
    // We need to use the hub event directly since assignTeam requires host
    // Instead, let's use a self-assign approach
    assignTeam(playerId, teamId);
  };

  return (
    <div className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">
      {/* Room Code Header */}
      <div className="text-center mb-6 animate-fade-in">
        <p className="text-xs text-(--text-secondary) uppercase tracking-wider mb-1">Room Code</p>
        <div className="text-4xl font-mono font-bold tracking-[0.3em] text-(--accent)">
          {room.code}
        </div>
        <p className="text-xs text-(--text-secondary) mt-2">
          {playerCount} player{playerCount !== 1 ? 's' : ''} joined
        </p>
      </div>

      {/* Teams — players can tap to switch */}
      <div className="space-y-3 mb-6 flex-1 overflow-y-auto">
        {room.teams.map((team) => {
          const myTeam = room.players[playerId || '']?.teamId === team.id;
          return (
            <div
              key={team.id}
              className={`bg-(--bg-card) rounded-2xl p-4 animate-slide-up transition-all ${
                myTeam ? 'ring-2 ring-(--accent)' : ''
              }`}
              style={{ borderLeft: `4px solid ${team.color}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm" style={{ color: team.color }}>
                  {team.name} ({team.playerIds.length})
                </h3>
                {!myTeam && (
                  <button
                    onClick={() => handleJoinTeam(team.id)}
                    className="text-xs px-3 py-1 rounded-lg bg-(--bg-secondary) text-(--text-secondary) hover:text-white transition-colors active:scale-95"
                    aria-label={`Join ${team.name}`}
                  >
                    Join
                  </button>
                )}
                {myTeam && (
                  <span className="text-xs text-(--text-secondary)">✓ Your team</span>
                )}
              </div>
              <div className="space-y-1">
                {team.playerIds.map((pid) => {
                  const player = room.players[pid];
                  if (!player) return null;
                  return (
                    <div key={pid} className="flex items-center gap-2 text-sm">
                      <span className="text-lg">{player.avatar}</span>
                      <span className={player.connected ? '' : 'opacity-50'}>
                        {player.name}
                        {player.isHost && <span className="text-(--accent) ml-1">👑</span>}
                        {!player.connected && <span className="text-(--text-secondary) ml-1">(offline)</span>}
                      </span>
                    </div>
                  );
                })}
                {team.playerIds.length === 0 && (
                  <p className="text-xs text-(--text-secondary)">No players yet</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Settings (Host only) */}
      {isHost && (
        <div className="bg-(--bg-card) rounded-2xl p-4 mb-4 animate-slide-up">
          <h3 className="font-semibold text-sm mb-3 text-(--text-secondary)">Game Settings</h3>

          {/* Team Count */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm">Teams</span>
            <div className="flex gap-2">
              {([2, 3] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => updateSettings({ teamCount: n })}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    room.settings.teamCount === n
                      ? 'bg-(--accent) text-white'
                      : 'bg-(--bg-secondary) text-(--text-secondary)'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Round Mode */}
          <div className="mb-3">
            <span className="text-sm block mb-2">Round Mode</span>
            <div className="flex gap-2">
              {([
                { value: 'timed' as RoundMode, label: '⏱ Timed' },
                { value: 'freeFlow' as RoundMode, label: '🌊 Free Flow' },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateSettings({ roundMode: value })}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                    room.settings.roundMode === value
                      ? 'bg-(--accent) text-white'
                      : 'bg-(--bg-secondary) text-(--text-secondary)'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Timer / Question count */}
          {room.settings.roundMode === 'timed' && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Timer</span>
              <div className="flex gap-2">
                {[30, 60, 90, 120].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateSettings({ timerSeconds: s })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      room.settings.timerSeconds === s
                        ? 'bg-(--accent) text-white'
                        : 'bg-(--bg-secondary) text-(--text-secondary)'
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

      {/* Actions */}
      <div className="space-y-3 pb-4">
        {isHost && (
          <button
            onClick={() => startGame('story-thief')}
            disabled={!canStart}
            className="w-full py-4 bg-(--accent) hover:bg-[#d63d56] disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-lg font-semibold transition-all active:scale-95 animate-pulse-glow"
          >
            {canStart ? '🎭 Start Story Thief' : `Need ${4 - playerCount} more players`}
          </button>
        )}

        {!isHost && (
          <div className="text-center py-4 text-(--text-secondary) text-sm">
            Waiting for host to start the game...
          </div>
        )}

        <button
          onClick={leaveRoom}
          className="w-full py-3 text-(--text-secondary) text-sm hover:text-white transition-colors"
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}
