// ============================================
// Poker Hand Evaluator
// Evaluates the best 5-card hand from 7 cards (2 hole + 5 community)
// ============================================

import type { Card, HandEvaluation } from '@/types/games/poker';
import { RANK_VALUES, SUIT_SYMBOLS } from '@/types/games/poker';

/**
 * Evaluate the best 5-card poker hand from up to 7 cards.
 * Returns the hand rank, best 5 cards, and a human-readable description.
 */
export function evaluateHand(cards: Card[]): HandEvaluation {
  if (cards.length < 5) {
    return {
      rank: 'high-card',
      rankIndex: 0,
      bestCards: cards.slice(0, 5),
      kickers: cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a),
      description: 'High Card',
    };
  }

  // Generate all 5-card combinations from the available cards
  const combos = getCombinations(cards, 5);
  let bestEval: HandEvaluation | null = null;

  for (const combo of combos) {
    const evaluation = evaluate5Cards(combo);
    if (!bestEval || compareHands(evaluation, bestEval) > 0) {
      bestEval = evaluation;
    }
  }

  return bestEval!;
}

/**
 * Compare two hand evaluations. Returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compareHands(a: HandEvaluation, b: HandEvaluation): number {
  if (a.rankIndex !== b.rankIndex) return a.rankIndex - b.rankIndex;
  // Compare kickers
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

/**
 * Evaluate exactly 5 cards.
 */
function evaluate5Cards(cards: Card[]): HandEvaluation {
  const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = checkStraight(values);
  const isAceLowStraight = checkAceLowStraight(values);

  // Count occurrences of each value
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const countEntries = [...counts.entries()].sort((a, b) => {
    // Sort by count desc, then by value desc
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // Royal Flush
  if (isFlush && isStraight && values[0] === 14) {
    return {
      rank: 'royal-flush',
      rankIndex: 9,
      bestCards: cards,
      kickers: [14],
      description: `Royal Flush, ${SUIT_SYMBOLS[suits[0]]}`,
    };
  }

  // Straight Flush
  if (isFlush && (isStraight || isAceLowStraight)) {
    const highCard = isAceLowStraight ? 5 : values[0];
    return {
      rank: 'straight-flush',
      rankIndex: 8,
      bestCards: cards,
      kickers: [highCard],
      description: `Straight Flush, ${rankName(highCard)} High`,
    };
  }

  // Four of a Kind
  if (countEntries[0][1] === 4) {
    const quadVal = countEntries[0][0];
    const kicker = countEntries[1][0];
    return {
      rank: 'four-of-a-kind',
      rankIndex: 7,
      bestCards: cards,
      kickers: [quadVal, kicker],
      description: `Four of a Kind, ${rankName(quadVal)}s`,
    };
  }

  // Full House
  if (countEntries[0][1] === 3 && countEntries[1][1] === 2) {
    return {
      rank: 'full-house',
      rankIndex: 6,
      bestCards: cards,
      kickers: [countEntries[0][0], countEntries[1][0]],
      description: `Full House, ${rankName(countEntries[0][0])}s full of ${rankName(countEntries[1][0])}s`,
    };
  }

  // Flush
  if (isFlush) {
    return {
      rank: 'flush',
      rankIndex: 5,
      bestCards: cards,
      kickers: values,
      description: `Flush, ${rankName(values[0])} High`,
    };
  }

  // Straight
  if (isStraight || isAceLowStraight) {
    const highCard = isAceLowStraight ? 5 : values[0];
    return {
      rank: 'straight',
      rankIndex: 4,
      bestCards: cards,
      kickers: [highCard],
      description: `Straight, ${rankName(highCard)} High`,
    };
  }

  // Three of a Kind
  if (countEntries[0][1] === 3) {
    const tripVal = countEntries[0][0];
    const kickers = countEntries.slice(1).map(e => e[0]);
    return {
      rank: 'three-of-a-kind',
      rankIndex: 3,
      bestCards: cards,
      kickers: [tripVal, ...kickers],
      description: `Three of a Kind, ${rankName(tripVal)}s`,
    };
  }

  // Two Pair
  if (countEntries[0][1] === 2 && countEntries[1][1] === 2) {
    const highPair = Math.max(countEntries[0][0], countEntries[1][0]);
    const lowPair = Math.min(countEntries[0][0], countEntries[1][0]);
    const kicker = countEntries[2][0];
    return {
      rank: 'two-pair',
      rankIndex: 2,
      bestCards: cards,
      kickers: [highPair, lowPair, kicker],
      description: `Two Pair, ${rankName(highPair)}s & ${rankName(lowPair)}s`,
    };
  }

  // One Pair
  if (countEntries[0][1] === 2) {
    const pairVal = countEntries[0][0];
    const kickers = countEntries.slice(1).map(e => e[0]);
    return {
      rank: 'one-pair',
      rankIndex: 1,
      bestCards: cards,
      kickers: [pairVal, ...kickers],
      description: `Pair of ${rankName(pairVal)}s`,
    };
  }

  // High Card
  return {
    rank: 'high-card',
    rankIndex: 0,
    bestCards: cards,
    kickers: values,
    description: `High Card, ${rankName(values[0])}`,
  };
}

function checkStraight(sortedValues: number[]): boolean {
  for (let i = 0; i < sortedValues.length - 1; i++) {
    if (sortedValues[i] - sortedValues[i + 1] !== 1) return false;
  }
  return true;
}

// Ace-low straight: A-2-3-4-5 (values would be [14, 5, 4, 3, 2])
function checkAceLowStraight(sortedValues: number[]): boolean {
  return (
    sortedValues[0] === 14 &&
    sortedValues[1] === 5 &&
    sortedValues[2] === 4 &&
    sortedValues[3] === 3 &&
    sortedValues[4] === 2
  );
}

function rankName(value: number): string {
  const names: Record<number, string> = {
    14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten',
    9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five',
    4: 'Four', 3: 'Three', 2: 'Two',
  };
  return names[value] || String(value);
}

/**
 * Generate all k-combinations from an array.
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  const results: T[][] = [];

  function combine(start: number, current: T[]) {
    if (current.length === k) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      combine(i + 1, current);
      current.pop();
    }
  }

  combine(0, []);
  return results;
}
