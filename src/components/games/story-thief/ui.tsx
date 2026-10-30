'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { Team } from '@/types/hub';
import type { StoryThiefMember } from '@/types/games/story-thief';

/** "Team Red" → "Red" (chips are short on a phone). */
export function teamShortName(name: string): string {
  return name.replace(/^Team\s+/i, '');
}

/** Inline style carrying a team color into the .st-* classes (team colors are the allowed hex exception). */
export function teamStyle(color: string | undefined): CSSProperties | undefined {
  return color ? ({ '--team': color } as CSSProperties) : undefined;
}

export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// ---- Screen layout: scrolling body + action footer anchored to the bottom ----

export function PhaseScreen({ children, footer, center = false }: { children: ReactNode; footer?: ReactNode; center?: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className={`flex flex-1 flex-col px-4 pb-4 ${center ? 'items-center justify-center text-center' : ''}`}>
        {children}
      </div>
      {footer && <div className="st-footer px-4 pt-6 st-safe-bottom">{footer}</div>}
    </div>
  );
}

// ---- The story card ----

interface StoryCardProps {
  story: string;
  teamColor?: string;
  size?: 'lg' | 'md' | 'sm';
  label?: string;
  className?: string;
}

export function StoryCard({ story, teamColor, size = 'md', label, className = '' }: StoryCardProps) {
  const text = size === 'lg' ? 'text-lg leading-7' : size === 'md' ? 'text-base leading-7' : 'text-sm leading-6';
  const pad = size === 'lg' ? 'px-6 pb-6 pt-5' : size === 'md' ? 'px-5 pb-5 pt-4' : 'px-4 pb-3.5 pt-3';
  return (
    <figure className={`story-card rounded-2xl ${pad} ${className}`} style={teamStyle(teamColor)}>
      <figcaption className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] st-team-text">
        <span aria-hidden="true">📜</span>
        {label ?? 'Whose truth?'}
      </figcaption>
      <blockquote className={`text-center font-medium text-(--text-primary) ${text}`}>
        <span className="st-quote-mark" aria-hidden="true">&ldquo;</span>
        {story}
        <span className="st-quote-mark" aria-hidden="true">&rdquo;</span>
      </blockquote>
    </figure>
  );
}

// ---- Avatars ----

export function Avatar({ emoji, size = 48, teamColor, dim = false, className = '' }: {
  emoji: string;
  size?: number;
  teamColor?: string;
  dim?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`st-avatar ${dim ? 'opacity-45 grayscale' : ''} ${className}`}
      style={{ ...teamStyle(teamColor), width: size, height: size, fontSize: Math.round(size * 0.5) }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}

/** The bluffing team, one of whom wrote the story. */
export function SuspectRow({ members, teamColor, myId, className = '' }: {
  members: StoryThiefMember[];
  teamColor?: string;
  myId: string;
  className?: string;
}) {
  return (
    <ul className={`flex flex-wrap justify-center gap-x-4 gap-y-3 ${className}`} aria-label="Suspects">
      {members.map(m => (
        <li key={m.id} className="flex w-16 flex-col items-center gap-1">
          <Avatar emoji={m.avatar} teamColor={teamColor} dim={!m.connected} />
          <span className="max-w-full truncate text-[11px] text-(--text-secondary)">
            {m.id === myId ? 'You' : m.name}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---- Vote progress ----

export function VoteProgress({ voted, total }: { voted: number; total: number }) {
  const pct = total > 0 ? Math.round((voted / total) * 100) : 0;
  return (
    <div className="w-full max-w-xs" role="status" aria-live="polite">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-(--text-muted)">Votes in</span>
        <span className="font-semibold tabular-nums text-(--text-primary)">{voted} / {total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-(--bg-elevated)">
        <div className="h-full rounded-full bg-(--game-accent) transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---- Scoreboard strip (header) ----

export function Scoreboard({ teams, scores, myTeamId, bluffingTeamId }: {
  teams: Team[];
  scores: Record<string, number>;
  myTeamId: string | null;
  bluffingTeamId: string | null;
}) {
  return (
    <ul className="flex gap-1.5 px-4 pb-2" aria-label="Team scores">
      {teams.map(team => {
        const mine = team.id === myTeamId;
        const bluffing = team.id === bluffingTeamId;
        return (
          <li
            key={team.id}
            className={`st-score-chip flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2.5 py-1.5 ${mine ? 'st-score-chip-mine' : ''}`}
            style={teamStyle(team.color)}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} aria-hidden="true" />
            <span className="min-w-0 truncate text-xs font-semibold st-team-text">
              {teamShortName(team.name)}
              {mine && <span className="ml-1 font-normal text-(--text-muted)">· you</span>}
            </span>
            {bluffing && (
              <span className="shrink-0 text-xs" title="Bluffing this round" aria-label="bluffing this round">🎭</span>
            )}
            <span key={scores[team.id] ?? 0} className="ml-auto shrink-0 text-sm font-bold tabular-nums text-(--text-primary) st-score-pop">
              {scores[team.id] ?? 0}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
