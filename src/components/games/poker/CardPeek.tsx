'use client';

import { useState, useRef } from 'react';
import type { Card, HandEvaluation } from '@/types/games/poker';
import { PlayingCard } from './PlayingCard';

interface CardPeekProps {
  cards: Card[];
  handStrength: HandEvaluation | null;
}

export function CardPeek({ cards, handStrength }: CardPeekProps) {
  const [peeking, setPeeking] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const touchStartY = useRef(0);

  if (cards.length === 0) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY > 20) {
      setPeeking(true);
    }
  };

  const handleTouchEnd = () => {
    setPeeking(false);
  };

  const handleClick = () => {
    setRevealed(!revealed);
  };

  const isVisible = peeking || revealed;

  // Hand strength color
  const strengthColor = handStrength
    ? handStrength.rankIndex >= 6 ? 'text-(--danger)' // monster (full house+)
    : handStrength.rankIndex >= 4 ? 'text-(--game-secondary)' // strong (straight+)
    : handStrength.rankIndex >= 1 ? 'text-(--text-primary)' // decent (pair+)
    : 'text-(--text-muted)' // weak
    : '';

  return (
    <div className="flex flex-col items-center py-3 px-4">
      {/* Drag hint */}
      {!revealed && (
        <p className="text-[10px] text-(--text-muted) mb-1">
          Drag down to peek • Tap to toggle
        </p>
      )}

      {/* Cards */}
      <div
        className="flex gap-2 cursor-pointer select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        role="button"
        aria-label="Peek at your cards"
        tabIndex={0}
      >
        {cards.map((card, i) => (
          <div
            key={i}
            className={`
              transition-transform duration-300
              ${isVisible ? 'scale-100' : 'scale-95'}
            `}
            style={{
              transform: isVisible
                ? 'rotateY(0deg)'
                : 'rotateY(180deg)',
              transformStyle: 'preserve-3d',
              transition: 'transform 0.4s ease',
            }}
          >
            {isVisible ? (
              <PlayingCard card={card} size="lg" />
            ) : (
              <PlayingCard card={card} size="lg" faceDown />
            )}
          </div>
        ))}
      </div>

      {/* Hand strength helper */}
      {isVisible && handStrength && (
        <p className={`text-xs mt-2 font-medium ${strengthColor}`}>
          {handStrength.description}
        </p>
      )}
    </div>
  );
}
