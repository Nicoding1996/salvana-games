'use client';

import type { CSSProperties } from 'react';

interface DiceIconProps {
  value: number;
  size?: number;
  highlighted?: boolean;   // counts for the face being looked at
  hidden?: boolean;        // face-down (not rolled / not revealed yet)
  wild?: boolean;          // wild ones are on: a 1 renders as the red wild die
  dim?: boolean;
  className?: string;
  style?: CSSProperties;
}

// Pip centers as % of the die face
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[27, 27], [73, 73]],
  3: [[27, 27], [50, 50], [73, 73]],
  4: [[27, 27], [73, 27], [27, 73], [73, 73]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[27, 24], [73, 24], [27, 50], [73, 50], [27, 76], [73, 76]],
};

/** A die drawn with CSS (ivory face, dark pips). Colors come from the Liar's Dice theme. */
export default function DiceIcon({
  value,
  size = 44,
  highlighted = false,
  hidden = false,
  wild = false,
  dim = false,
  className = '',
  style,
}: DiceIconProps) {
  const sizeStyle = { '--die-size': `${size}px`, ...style } as CSSProperties;

  if (hidden) {
    return (
      <span className={`ld-die ld-die-hidden ${className}`} style={sizeStyle} role="img" aria-label="Hidden die">
        <span className="ld-die-q" aria-hidden="true">?</span>
      </span>
    );
  }

  const isWild = wild && value === 1;
  const classes = [
    'ld-die',
    isWild ? 'ld-die-wild' : '',
    highlighted ? 'ld-die-match' : '',
    dim ? 'ld-die-dim' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} style={sizeStyle} role="img" aria-label={`Die showing ${value}${isWild ? ' (wild)' : ''}`}>
      {(PIPS[value] ?? PIPS[1]).map(([x, y], i) => (
        <span key={i} className="ld-pip" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true" />
      ))}
    </span>
  );
}
