// Shared text helpers for the poker UI

import type { ActionHistoryEntry, LoggedAction, PokerPhase } from '@/types/games/poker';

export function formatChips(n: number): string {
  return n.toLocaleString('en-US');
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export const STREET_NAMES: Partial<Record<PokerPhase, string>> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

/** Short seat label for a player's latest action on this street, e.g. "Raise" */
export const SEAT_ACTION_LABELS: Record<LoggedAction, string> = {
  smallBlind: 'SB',
  bigBlind: 'BB',
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
  allIn: 'All in',
};

/** One line of hand narration, e.g. "Bob raises to 120" (amounts are street totals). */
export function describeAction(entry: ActionHistoryEntry, isMe: boolean): string {
  const who = isMe ? 'You' : entry.playerName;
  const s = isMe ? '' : 's';
  const total = formatChips(entry.totalBet);
  switch (entry.action) {
    case 'smallBlind': return `${who} post${s} the small blind (${total})`;
    case 'bigBlind': return `${who} post${s} the big blind (${total})`;
    case 'fold': return `${who} fold${s}`;
    case 'check': return `${who} check${s}`;
    case 'call': return `${who} call${s} ${total}`;
    case 'bet': return `${who} bet${s} ${total}`;
    case 'raise': return `${who} raise${s} to ${total}`;
    case 'allIn': return `${who} ${isMe ? 'are' : 'is'} all in (${total})`;
  }
}
