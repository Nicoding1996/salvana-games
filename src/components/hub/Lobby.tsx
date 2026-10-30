'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { useRoom } from '@/lib/hub/useRoom';
import type { RoundMode } from '@/types/hub';
import { AVATARS } from '@/types/hub';
import { MIN_TEAM_SIZE } from '@/types/games/story-thief';
import type { LiarsDiceSettings } from '@/types/games/liars-dice';
import { DEFAULT_LIARS_DICE_SETTINGS } from '@/types/games/liars-dice';
import type { BattleshipSettings } from '@/types/games/battleship';
import { DEFAULT_BATTLESHIP_SETTINGS } from '@/types/games/battleship';
import type { PokerSettings } from '@/types/games/poker';
import { DEFAULT_POKER_SETTINGS } from '@/types/games/poker';
import type { Flip7Settings } from '@/types/games/flip7';
import { DEFAULT_FLIP7_SETTINGS } from '@/types/games/flip7';
import QRCode from '@/components/shared/QRCode';
import { GameSelector } from '@/components/hub/GameCard';
import { LogOutIcon } from '@/components/shared/Icons';
import { GAME_REGISTRY, getGameById, getDefaultGame } from '@/lib/gameRegistry';

/* ============================================
   Settings option lists — values must match the settings types
   ============================================ */

interface Option<T> {
  value: T;
  label: string;
}

function timerOptions<T extends number>(values: readonly T[]): Option<T>[] {
  return values.map((s) => ({ value: s, label: s === 0 ? 'Off' : `${s}s` }));
}

const TEAM_COUNT_OPTIONS: Option<2 | 3>[] = [{ value: 2, label: '2' }, { value: 3, label: '3' }];
const ROUND_MODE_OPTIONS: Option<RoundMode>[] = [
  { value: 'timed', label: '⏱ Timed' },
  { value: 'freeFlow', label: '🌊 Free' },
];
const ROUND_TIMER_OPTIONS: Option<number>[] = [30, 60, 90, 120].map((s) => ({ value: s, label: `${s}s` }));

const DICE_LIVES_OPTIONS: Option<2 | 3>[] = [{ value: 2, label: '❤️❤️' }, { value: 3, label: '❤️❤️❤️' }];
const DICE_TIMER_OPTIONS = timerOptions([15, 30, 45, 0] as const);

const GRID_SIZE_OPTIONS: Option<8 | 10>[] = [{ value: 8, label: '8×8' }, { value: 10, label: '10×10' }];
const SHOT_MODE_OPTIONS: Option<'salvo' | 'classic'>[] = [
  { value: 'salvo', label: '💣 Salvo' },
  { value: 'classic', label: '🎯 Classic' },
];
const BATTLESHIP_TIMER_OPTIONS = timerOptions([15, 30, 45, 0] as const);
const PLACEMENT_TIMER_OPTIONS = timerOptions([30, 60, 0] as const);

const CHIP_OPTIONS: Option<500 | 1000 | 2000>[] = [
  { value: 500, label: '500' },
  { value: 1000, label: '1000' },
  { value: 2000, label: '2000' },
];
const BLIND_SPEED_OPTIONS: Option<'slow' | 'normal' | 'fast'>[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];
const STARTING_BLIND_OPTIONS: Option<'10/20' | '25/50'>[] = [
  { value: '10/20', label: '10/20' },
  { value: '25/50', label: '25/50' },
];
const POKER_TIMER_OPTIONS = timerOptions([15, 30, 45, 0] as const);

const TARGET_SCORE_OPTIONS: Option<100 | 200 | 300>[] = [
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 300, label: '300' },
];
const FLIP7_TIMER_OPTIONS = timerOptions([10, 15, 30, 0] as const);
const FLIP7_MODE_OPTIONS: Option<'classic' | 'chaos'>[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'chaos', label: 'Chaos' },
];

interface LobbyProps {
  roomHook: ReturnType<typeof useRoom>;
}

export default function Lobby({ roomHook }: LobbyProps) {
  const { room, playerId, isHost, updateSettings, assignTeam, shuffleTeams, startGame, selectGame, leaveRoom, kickPlayer, changeAvatar } = roomHook;
  const [showQR, setShowQR] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [kickConfirm, setKickConfirm] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [diceSettings, setDiceSettings] = useState<LiarsDiceSettings>({ ...DEFAULT_LIARS_DICE_SETTINGS });
  const [battleshipSettings, setBattleshipSettings] = useState<BattleshipSettings>({ ...DEFAULT_BATTLESHIP_SETTINGS });
  const [pokerSettings, setPokerSettings] = useState<PokerSettings>({ ...DEFAULT_POKER_SETTINGS });
  const [flip7Settings, setFlip7Settings] = useState<Flip7Settings>({ ...DEFAULT_FLIP7_SETTINGS });
  const router = useRouter();
  if (!room) return null;

  // Use server-synced selectedGameId so all players see the same view
  const selectedGame = room.selectedGameId || 'story-thief';
  const playerCount = Object.keys(room.players).length;
  const selectedGameDef = getGameById(selectedGame) || getDefaultGame();
  const isFreeForAll = !selectedGameDef.isTeamGame;

  // Player limits come from the registry, so the selector, the player list and the start button all agree.
  // The server counts players who are online, so the start gate does too.
  const onlineCount = Object.values(room.players).filter((p) => p.connected).length;
  const maxPlayersForSelected = selectedGameDef.maxPlayers;
  const tooMany = onlineCount > maxPlayersForSelected;
  // Team games: every team needs enough players to bluff and to guess
  const teamsTooSmall = !isFreeForAll && room.teams.some(
    (t) => t.playerIds.filter((pid) => room.players[pid]?.connected).length < MIN_TEAM_SIZE,
  );
  const canStart = onlineCount >= selectedGameDef.minPlayers && !tooMany && !teamsTooSmall;
  const roomUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${room.code}` : '';
  const hostName = room.players[room.hostId]?.name;

  const handleLeave = () => {
    leaveRoom();
    router.push('/');
  };

  const handleJoinTeam = (teamId: string) => {
    if (!playerId) return;
    assignTeam(playerId, teamId);
  };

  const handleKick = (targetId: string) => {
    if (kickConfirm === targetId) {
      kickPlayer(targetId);
      setKickConfirm(null);
    } else {
      setKickConfirm(targetId);
      setTimeout(() => setKickConfirm(null), 3000);
    }
  };

  const handleAvatarSelect = (avatar: string) => {
    changeAvatar(avatar);
    setShowAvatarPicker(false);
  };

  const myAvatar = playerId && room.players[playerId] ? room.players[playerId].avatar : '😎';

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl || room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStart = () => {
    const maxPlayers = selectedGameDef.maxPlayers;
    if (selectedGame === 'liars-dice') {
      startGame('liars-dice', { ...diceSettings, maxPlayers });
    } else if (selectedGame === 'battleship') {
      startGame('battleship', { ...battleshipSettings, maxPlayers });
    } else if (selectedGame === 'poker') {
      startGame('poker', { ...pokerSettings, maxPlayers });
    } else if (selectedGame === 'flip7') {
      startGame('flip7', { ...flip7Settings, maxPlayers });
    } else {
      startGame('story-thief');
    }
  };

  const playersNeeded = selectedGameDef.minPlayers - onlineCount;

  return (
    <div className="flex-1 flex flex-col px-4 pt-4 max-w-lg mx-auto w-full" data-game={selectedGameDef.dataGameAttr}>
      {/* Room Code — tap to show QR */}
      <div className="text-center mb-5 animate-fade-in">
        <p className="text-[10px] uppercase tracking-[0.2em] text-(--text-muted) mb-1">Room Code</p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setShowQR(!showQR)}
            className="text-3xl font-mono font-bold tracking-[0.3em] text-(--brand) hover:text-(--game-accent-strong) transition-colors"
            aria-label={showQR ? 'Hide QR code' : 'Show QR code'}
          >
            {room.code}
          </button>
          <button
            onClick={handleCopyCode}
            className="p-1.5 rounded-lg text-(--text-muted) hover:text-(--brand) hover:bg-(--bg-elevated) transition-all active:scale-90"
            aria-label="Copy room link"
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-(--success)">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-(--text-muted) mt-1.5">
          {copied ? '✓ Link copied!' : `${playerCount} player${playerCount !== 1 ? 's' : ''} · tap code for QR`}
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

      {/* Avatar Picker */}
      <div className="flex justify-center mb-4">
        <button
          onClick={() => setShowAvatarPicker(!showAvatarPicker)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-(--border) hover:border-(--brand)/40 transition-colors active:scale-95"
          aria-label="Change avatar"
        >
          <span className="text-2xl">{myAvatar}</span>
          <span className="text-xs text-(--text-secondary)">Change avatar</span>
        </button>
      </div>

      {showAvatarPicker && (
        <div className="bg-(--bg-card) border border-(--border) rounded-xl p-3 mb-4 animate-slide-up">
          <div className="grid grid-cols-6 gap-2">
            {AVATARS.map((avatar) => (
              <button
                key={avatar}
                onClick={() => handleAvatarSelect(avatar)}
                className={`text-2xl p-2 rounded-lg transition-all active:scale-90 ${
                  avatar === myAvatar
                    ? 'bg-(--brand)/20 ring-2 ring-(--brand)'
                    : 'hover:bg-(--bg-elevated)'
                }`}
                aria-label={`Select avatar ${avatar}`}
              >
                {avatar}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ============================================
          GAME SELECTOR — tile grid (host) + selected game card
          ============================================ */}
      <GameSelector
        games={GAME_REGISTRY}
        selectedGameId={selectedGame}
        isHost={isHost}
        playerCount={playerCount}
        onSelect={(id) => selectGame(id)}
      />

      {/* Shuffle button — only for team games */}
      {isHost && !isFreeForAll && (
        <div className="flex justify-end mb-2">
          <button
            onClick={shuffleTeams}
            className="text-xs px-3 py-1.5 rounded-lg border border-(--border) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--brand)/40 transition-colors active:scale-95"
          >
            🔀 Shuffle
          </button>
        </div>
      )}

      {/* Teams — hidden for free-for-all games */}
      {!isFreeForAll && (
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
                      <div key={pid} className="flex items-center gap-2 text-sm py-0.5 animate-player-join">
                        <span>{player.avatar}</span>
                        <span className={player.connected ? 'text-(--text-primary)' : 'text-(--text-muted)'}>
                          {player.name}
                        </span>
                        {player.isHost && <span className="text-(--brand) text-xs">host</span>}
                        {!player.connected && <span className="text-(--text-muted) text-xs">offline</span>}
                        {isHost && pid !== playerId && (
                          <button
                            onClick={() => handleKick(pid)}
                            className={`ml-auto text-xs px-2 py-0.5 rounded transition-all active:scale-90 ${
                              kickConfirm === pid
                                ? 'bg-(--danger)/20 text-(--danger) font-medium'
                                : 'text-(--text-muted) hover:text-(--danger)'
                            }`}
                            aria-label={kickConfirm === pid ? `Confirm kick ${player.name}` : `Kick ${player.name}`}
                          >
                            {kickConfirm === pid ? 'Confirm?' : '✕'}
                          </button>
                        )}
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

      {/* Player list for free-for-all games (no teams) */}
      {isFreeForAll && (
        <div className="bg-(--bg-card) border border-(--border) rounded-xl p-3.5 mb-5 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm text-(--text-primary)">Players</h3>
            <span className={`text-xs ${tooMany ? 'text-(--danger) font-medium' : 'text-(--text-muted)'}`}>
              {onlineCount}/{maxPlayersForSelected}
            </span>
          </div>
          <div className="space-y-0.5">
            {Object.values(room.players).map((player) => (
              <div key={player.id} className="flex items-center gap-2 text-sm py-0.5 animate-player-join">
                <span>{player.avatar}</span>
                <span className={player.connected ? 'text-(--text-primary)' : 'text-(--text-muted)'}>
                  {player.name}
                </span>
                {player.isHost && <span className="text-(--brand) text-xs">host</span>}
                {!player.connected && <span className="text-(--text-muted) text-xs">offline</span>}
                {isHost && player.id !== playerId && (
                  <button
                    onClick={() => handleKick(player.id)}
                    className={`ml-auto text-xs px-2 py-0.5 rounded transition-all active:scale-90 ${
                      kickConfirm === player.id
                        ? 'bg-(--danger)/20 text-(--danger) font-medium'
                        : 'text-(--text-muted) hover:text-(--danger)'
                    }`}
                    aria-label={kickConfirm === player.id ? `Confirm kick ${player.name}` : `Kick ${player.name}`}
                  >
                    {kickConfirm === player.id ? 'Confirm?' : '✕'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================
          SETTINGS (host only) — panel swaps with the selected game.
          Active options use --game-accent, which follows the selected game via data-game.
          ============================================ */}

      {isHost && !isFreeForAll && (
        <SettingsCard title="Settings">
          <SettingRow label="Teams">
            <OptionGroup
              label="Number of teams"
              options={TEAM_COUNT_OPTIONS}
              value={room.settings.teamCount}
              onChange={(teamCount) => updateSettings({ teamCount })}
            />
          </SettingRow>
          <SettingRow label="Mode">
            <OptionGroup
              label="Round mode"
              options={ROUND_MODE_OPTIONS}
              value={room.settings.roundMode}
              onChange={(roundMode) => updateSettings({ roundMode })}
            />
          </SettingRow>
          {room.settings.roundMode === 'timed' && (
            <SettingRow label="Timer">
              <OptionGroup
                label="Question timer"
                options={ROUND_TIMER_OPTIONS}
                value={room.settings.timerSeconds}
                onChange={(timerSeconds) => updateSettings({ timerSeconds })}
              />
            </SettingRow>
          )}
        </SettingsCard>
      )}

      {isHost && selectedGame === 'liars-dice' && (
        <SettingsCard title="Dice Settings">
          <SettingRow label="Lives">
            <OptionGroup
              label="Lives"
              options={DICE_LIVES_OPTIONS}
              value={diceSettings.lives}
              onChange={(lives) => setDiceSettings((s) => ({ ...s, lives }))}
            />
          </SettingRow>
          <SettingRow label="Turn timer">
            <OptionGroup
              label="Turn timer"
              options={DICE_TIMER_OPTIONS}
              value={diceSettings.turnTimer}
              onChange={(turnTimer) => setDiceSettings((s) => ({ ...s, turnTimer }))}
            />
          </SettingRow>
          <SettingRow label="Wild 1s ★" hint="1s count as any face">
            <Toggle
              label="Wild ones"
              checked={diceSettings.wildOnes}
              onChange={(wildOnes) => setDiceSettings((s) => ({ ...s, wildOnes }))}
            />
          </SettingRow>
          <SettingRow label="Spot On 🎯" hint="Call exact bid">
            <Toggle
              label="Spot On"
              checked={diceSettings.spotOn}
              onChange={(spotOn) => setDiceSettings((s) => ({ ...s, spotOn }))}
            />
          </SettingRow>
        </SettingsCard>
      )}

      {isHost && selectedGame === 'battleship' && (
        <SettingsCard title="Battleship Settings">
          <SettingRow label="Grid size">
            <OptionGroup
              label="Grid size"
              options={GRID_SIZE_OPTIONS}
              value={battleshipSettings.gridSize}
              onChange={(gridSize) => setBattleshipSettings((s) => ({ ...s, gridSize }))}
            />
          </SettingRow>
          <SettingRow label="Shots" hint="Salvo = shots per ship">
            <OptionGroup
              label="Shot mode"
              options={SHOT_MODE_OPTIONS}
              value={battleshipSettings.shotMode}
              onChange={(shotMode) => setBattleshipSettings((s) => ({ ...s, shotMode }))}
            />
          </SettingRow>
          <SettingRow label="Turn timer">
            <OptionGroup
              label="Turn timer"
              options={BATTLESHIP_TIMER_OPTIONS}
              value={battleshipSettings.turnTimer}
              onChange={(turnTimer) => setBattleshipSettings((s) => ({ ...s, turnTimer }))}
            />
          </SettingRow>
          <SettingRow label="Place timer">
            <OptionGroup
              label="Placement timer"
              options={PLACEMENT_TIMER_OPTIONS}
              value={battleshipSettings.placementTimer}
              onChange={(placementTimer) => setBattleshipSettings((s) => ({ ...s, placementTimer }))}
            />
          </SettingRow>
          <SettingRow label="Sonar 📡" hint="Scan 2×2 area once">
            <Toggle
              label="Sonar ping"
              checked={battleshipSettings.sonarPing}
              onChange={(sonarPing) => setBattleshipSettings((s) => ({ ...s, sonarPing }))}
            />
          </SettingRow>
        </SettingsCard>
      )}

      {isHost && selectedGame === 'poker' && (
        <SettingsCard title="Poker Settings">
          <SettingRow label="Chips 🪙" hint="Starting stack">
            <OptionGroup
              label="Starting chips"
              options={CHIP_OPTIONS}
              value={pokerSettings.startingChips}
              onChange={(startingChips) => setPokerSettings((s) => ({ ...s, startingChips }))}
            />
          </SettingRow>
          <SettingRow label="Blinds" hint="Speed of increases">
            <OptionGroup
              label="Blind speed"
              options={BLIND_SPEED_OPTIONS}
              value={pokerSettings.blindStructure}
              onChange={(blindStructure) => setPokerSettings((s) => ({ ...s, blindStructure }))}
            />
          </SettingRow>
          <SettingRow label="Start blinds">
            <OptionGroup
              label="Starting blinds"
              options={STARTING_BLIND_OPTIONS}
              value={pokerSettings.startingBlinds}
              onChange={(startingBlinds) => setPokerSettings((s) => ({ ...s, startingBlinds }))}
            />
          </SettingRow>
          <SettingRow label="Turn timer">
            <OptionGroup
              label="Turn timer"
              options={POKER_TIMER_OPTIONS}
              value={pokerSettings.turnTimer}
              onChange={(turnTimer) => setPokerSettings((s) => ({ ...s, turnTimer }))}
            />
          </SettingRow>
          <SettingRow label="Bounty 💀" hint="Track eliminations">
            <Toggle
              label="Bounty mode"
              checked={pokerSettings.bountyMode}
              onChange={(bountyMode) => setPokerSettings((s) => ({ ...s, bountyMode }))}
            />
          </SettingRow>
        </SettingsCard>
      )}

      {isHost && selectedGame === 'flip7' && (
        <SettingsCard title="Flip 7 Settings">
          <SettingRow label="Target score" hint="First to reach wins">
            <OptionGroup
              label="Target score"
              options={TARGET_SCORE_OPTIONS}
              value={flip7Settings.targetScore}
              onChange={(targetScore) => setFlip7Settings((s) => ({ ...s, targetScore }))}
            />
          </SettingRow>
          <SettingRow label="Turn timer" hint="Auto-stay on expire">
            <OptionGroup
              label="Turn timer"
              options={FLIP7_TIMER_OPTIONS}
              value={flip7Settings.turnTimer}
              onChange={(turnTimer) => setFlip7Settings((s) => ({ ...s, turnTimer }))}
            />
          </SettingRow>
          <SettingRow label="Mode" hint="Classic = turns, Chaos = simultaneous">
            <OptionGroup
              label="Game mode"
              options={FLIP7_MODE_OPTIONS}
              value={flip7Settings.mode}
              onChange={(mode) => setFlip7Settings((s) => ({ ...s, mode }))}
            />
          </SettingRow>
        </SettingsCard>
      )}

      {/* Start / Wait — anchored to the bottom of the screen */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-auto px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] bg-linear-to-t from-(--bg-primary) from-70% to-transparent">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleLeave}
            className="h-14 shrink-0 px-4 rounded-2xl flex items-center gap-2 bg-(--bg-card) border border-(--border-light) text-sm font-medium text-(--text-secondary) hover:text-(--text-primary) active:scale-[0.97] transition-[transform,color]"
          >
            <LogOutIcon size={16} />
            Leave
          </button>

          {isHost ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={!canStart}
              className="flex-1 min-w-0 h-14 px-4 rounded-2xl bg-(--game-accent) text-(--bg-primary) font-heading text-base font-semibold truncate transition-[transform,opacity] active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100"
            >
              {canStart
                ? `${selectedGameDef.icon} Start ${selectedGameDef.name}`
                : tooMany
                  ? `Too many players (max ${maxPlayersForSelected})`
                  : playersNeeded > 0
                    ? `Need ${playersNeeded} more player${playersNeeded !== 1 ? 's' : ''}`
                    : `Each team needs ${MIN_TEAM_SIZE}+ players`
              }
            </button>
          ) : (
            <div
              className="flex-1 min-w-0 h-14 px-4 rounded-2xl border border-dashed border-(--border-light) flex items-center justify-center gap-2 text-sm text-(--text-secondary)"
              role="status"
            >
              <span className="w-2 h-2 shrink-0 rounded-full bg-(--game-accent) animate-soft-pulse" aria-hidden="true" />
              <span className="truncate">Waiting for {hostName ?? 'the host'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================
   Settings controls
   ============================================ */

function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-(--bg-card) border border-(--border) rounded-2xl p-4 mb-4 animate-fade-in" aria-label={title}>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-(--text-muted) mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-(--text-primary)">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-(--text-muted)">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Segmented control: one choice from a short list. */
function OptionGroup<T extends string | number>({ label, options, value, onChange }: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 p-0.5 rounded-xl bg-(--bg-secondary) border border-(--border)">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`min-h-11 min-w-11 px-2.5 rounded-[10px] text-sm whitespace-nowrap transition-colors ${
              active
                ? 'bg-(--game-accent) text-(--bg-primary) font-semibold shadow-sm'
                : 'text-(--text-secondary) hover:text-(--text-primary)'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch with a 44px touch target. */
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="shrink-0 w-14 h-11 -mr-1 flex items-center justify-center"
    >
      <span
        className={`w-12 h-7 px-1 flex items-center rounded-full border transition-colors ${
          checked ? 'bg-(--game-accent) border-transparent' : 'bg-(--bg-elevated) border-(--border-light)'
        }`}
        aria-hidden="true"
      >
        <span
          className={`w-5 h-5 rounded-full shadow transition-transform ${
            checked ? 'translate-x-5 bg-(--bg-primary)' : 'translate-x-0 bg-(--text-secondary)'
          }`}
        />
      </span>
    </button>
  );
}
