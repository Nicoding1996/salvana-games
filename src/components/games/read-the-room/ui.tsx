'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { ReadTheRoomClientState, ReadTheRoomMember, ReadTheRoomPair, ReadTheRoomTeamView, ReadTheRoomTimer } from '@/types/games/read-the-room';
import TimerBar from '@/components/shared/TimerBar';

// ---- Small helpers ----

/** "Team Red" → "Red" (chips are short on a phone). */
export function teamShortName(name: string): string {
  return name.replace(/^Team\s+/i, '');
}

/** Inline style carrying a team color into the .rtr-* classes (team colors are the allowed hex exception). */
export function teamStyle(color: string | undefined): CSSProperties | undefined {
  return color ? ({ '--team': color } as CSSProperties) : undefined;
}

export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export function findTeam(state: ReadTheRoomClientState, teamId: string | null): ReadTheRoomTeamView | undefined {
  return teamId ? state.teams.find(t => t.id === teamId) : undefined;
}

/** Any player in the game, including players who left. */
export function findMember(state: ReadTheRoomClientState, playerId: string | null): ReadTheRoomMember | undefined {
  if (!playerId) return undefined;
  for (const team of state.teams) {
    const member = team.members.find(m => m.id === playerId);
    if (member) return member;
  }
  return undefined;
}

/** "You" for this player, otherwise their name. */
export function displayName(state: ReadTheRoomClientState, playerId: string | null, myId: string | null): string {
  if (playerId && playerId === myId) return 'You';
  return findMember(state, playerId)?.name ?? 'Someone';
}

// ---- Screen layout: scrolling body + action footer anchored to the bottom ----

export function Screen({ children, footer, center = false }: { children: ReactNode; footer?: ReactNode; center?: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className={`flex flex-1 flex-col px-4 pb-4 ${center ? 'items-center justify-center text-center' : ''}`}>
        {children}
      </div>
      {footer && <div className="rtr-footer px-4 pt-5 rtr-safe-bottom">{footer}</div>}
    </div>
  );
}

// ---- Avatars ----

export function Avatar({ emoji, size = 40, teamColor, dim = false, holding = false, className = '' }: {
  emoji: string;
  size?: number;
  teamColor?: string;
  dim?: boolean;
  holding?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`rtr-avatar ${holding ? 'rtr-avatar-holding' : ''} ${dim ? 'opacity-45 grayscale' : ''} ${className}`}
      style={{ ...teamStyle(teamColor), width: size, height: size, fontSize: Math.round(size * 0.5) }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}

// ---- The clue, as everyone sees it ----

export function ClueCard({ pair, clue, giverName, mine, teamColor, compact = false }: {
  pair: ReadTheRoomPair | null;
  clue: string | null;
  giverName: string;
  mine: boolean;
  teamColor?: string;
  compact?: boolean;
}) {
  if (!clue) return null;
  return (
    <figure className={`rtr-card rounded-2xl text-center ${compact ? 'px-4 py-2.5' : 'px-4 py-3.5'}`} style={teamStyle(teamColor)}>
      <figcaption className="text-[10px] font-semibold uppercase tracking-[0.2em] rtr-team-text">
        <span aria-hidden="true">💬 </span>{mine ? 'Your clue' : `${giverName}’s clue`}
      </figcaption>
      <blockquote className={`mt-1 break-words font-heading font-bold text-(--text-primary) ${compact ? 'text-lg leading-6' : 'text-2xl leading-8'}`}>
        “{clue}”
      </blockquote>
      {/* Short phones: the dial's labels show the scale right below a compact card */}
      {pair && (
        <p className={`mt-1 text-xs text-(--text-muted) ${compact ? 'rtr-tall-only' : ''}`}>
          {pair.left} <span aria-label="to">↔</span> {pair.right}
        </p>
      )}
    </figure>
  );
}

// ---- Scoreboard strip (header) ----

export function Scoreboard({ teams, scores, myTeamId, activeTeamId }: {
  teams: ReadTheRoomTeamView[];
  scores: Record<string, number>;
  myTeamId: string | null;
  activeTeamId: string | null;
}) {
  return (
    <ul className="flex gap-1.5 px-4 pb-2" aria-label="Team scores">
      {teams.map(team => {
        const mine = team.id === myTeamId;
        const active = team.id === activeTeamId;
        const score = scores[team.id] ?? 0;
        return (
          <li
            key={team.id}
            className={`rtr-score-chip flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2.5 py-1.5 ${mine ? 'rtr-score-chip-mine' : ''} ${active ? 'rtr-score-chip-active' : ''}`}
            style={teamStyle(team.color)}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
            <span className="min-w-0 truncate text-xs font-semibold rtr-team-text">
              {teamShortName(team.name)}
              {mine && <span className="ml-1 font-normal text-(--text-muted)">· you</span>}
            </span>
            {active && (
              <span className="shrink-0 text-xs" title="Their turn" aria-label="their turn">🧭</span>
            )}
            <span key={score} className="ml-auto shrink-0 text-sm font-bold tabular-nums text-(--text-primary) rtr-score-pop">
              {score}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---- A team's players: who gives the clue, who holds the dial, who is away ----

export function MemberRow({ members, teamColor, myId, clueGiverId = null, holderId = null, label }: {
  members: ReadTheRoomMember[];
  teamColor?: string;
  myId: string | null;
  clueGiverId?: string | null;
  holderId?: string | null;
  label: string;
}) {
  if (members.length === 0) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-x-3 gap-y-2" aria-label={label}>
      {members.map(m => {
        const away = !m.left && !m.connected;
        const tag = m.left ? 'left' : away ? 'away' : m.id === holderId ? '✋ dial' : m.id === clueGiverId ? '💬 clue' : null;
        return (
          <li key={m.id} className="flex w-14 flex-col items-center gap-0.5">
            <Avatar emoji={m.avatar} size={36} teamColor={teamColor} dim={m.left || away} holding={m.id === holderId} />
            <span className="max-w-full truncate text-[11px] text-(--text-secondary)">{m.id === myId ? 'You' : m.name}</span>
            {tag && (
              <span className={`text-[10px] leading-none ${m.left || away ? 'text-(--text-muted)' : 'text-(--game-accent)'}`}>{tag}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---- Countdown with a label ----

export function TimerLine({ timer, label }: { timer: ReadTheRoomTimer | null; label: string }) {
  if (!timer) return null;
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-(--text-muted)">
        <span>{label}</span>
        <span className={`font-semibold tabular-nums ${timer.secondsLeft <= 5 ? 'text-(--danger)' : 'text-(--text-secondary)'}`}>
          {timer.secondsLeft}s
        </span>
      </div>
      <TimerBar seconds={timer.secondsLeft} total={timer.total} />
    </div>
  );
}

// ---- Bottom-bar note when there's nothing for this player to press ----

export function FooterNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-14 items-center justify-center rounded-2xl border border-dashed border-(--border-light) px-4 text-center text-sm text-(--text-secondary)" role="status">
      {children}
    </p>
  );
}
