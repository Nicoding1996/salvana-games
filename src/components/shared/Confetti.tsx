'use client';

import { useEffect, useState } from 'react';

const COLORS = ['#e8a849', '#9b7bdf', '#4ade80', '#f87171', '#60a5fa', '#f472b6'];
const PIECE_COUNT = 30;
const VISIBLE_MS = 2500;

interface Piece {
  id: number;
  left: number;
  delay: number;
  color: string;
  size: number;
  round: boolean;
}

function makePieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 6 + Math.random() * 6,
    round: Math.random() > 0.5,
  }));
}

export default function Confetti() {
  // Random layout is generated once per mount (lazy initializer), never during re-renders
  const [pieces] = useState(makePieces);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="confetti-container" aria-hidden="true">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            top: '-10px',
            animationDelay: `${p.delay}s`,
            backgroundColor: p.color,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: p.round ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}
