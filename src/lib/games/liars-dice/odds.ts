// ============================================
// Liar's Dice — bid odds from one player's point of view
// ============================================
// You can see your own dice; everyone else's are hidden. Each hidden die shows
// a face with chance 1/6 (2/6 when wild 1s count for it), so the number of
// hidden matches follows a binomial distribution.

import type { Bid } from '@/types/games/liars-dice';
import { countMatches } from '@/types/games/liars-dice';

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

function chanceExactly(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  return binomial(n, k) * p ** k * (1 - p) ** (n - k);
}

function chanceAtLeast(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let total = 0;
  for (let i = k; i <= n; i++) total += chanceExactly(i, n, p);
  return Math.min(1, total);
}

export interface BidOdds {
  mine: number;        // matching dice I hold
  hidden: number;      // dice I can't see
  atLeast: number;     // chance the bid is true (0–1)
  exactly: number;     // chance it's exactly right, for SPOT ON (0–1)
}

export function bidOdds(bid: Bid, myDice: readonly number[], totalDice: number, wildOnes: boolean): BidOdds {
  const mine = countMatches(myDice, bid.faceValue, wildOnes);
  const hidden = Math.max(0, totalDice - myDice.length);
  const p = wildOnes && bid.faceValue !== 1 ? 2 / 6 : 1 / 6;
  const need = bid.quantity - mine;
  return { mine, hidden, atLeast: chanceAtLeast(need, hidden, p), exactly: chanceExactly(need, hidden, p) };
}

/** 0–1 → whole percent, never showing a flat 0% or 100% unless it's certain. */
export function percent(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 100;
  return Math.min(99, Math.max(1, Math.round(p * 100)));
}

/** Traffic-light color for "how likely is this true". */
export function oddsTone(p: number): string {
  if (p >= 0.6) return 'var(--success)';
  if (p >= 0.3) return 'var(--game-secondary)';
  return 'var(--danger)';
}
