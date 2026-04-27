'use client';

interface DiceIconProps {
  value: number;
  size?: number;
  highlighted?: boolean;
  hidden?: boolean;
  wild?: boolean;        // show as wild (red tint for 1s)
  className?: string;
}

// Standard dice dot positions in a 100x100 viewBox
const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[30, 30], [50, 50], [70, 70]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 30], [70, 30], [30, 50], [70, 50], [30, 70], [70, 70]],
};

export default function DiceIcon({
  value,
  size = 48,
  highlighted = false,
  hidden = false,
  wild = false,
  className = '',
}: DiceIconProps) {
  if (hidden) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-xl ${className}`}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(145deg, var(--bg-elevated), var(--bg-card))',
          border: '1.5px solid var(--border)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
        aria-label="Hidden die"
      >
        <span className="text-(--text-muted) font-bold" style={{ fontSize: size * 0.35 }}>?</span>
      </div>
    );
  }

  const dots = DOT_POSITIONS[value] || DOT_POSITIONS[1];
  const isWild = wild && value === 1;

  // Colors
  const bgGradient = isWild
    ? 'url(#wildBg)'
    : highlighted
      ? 'url(#highlightBg)'
      : 'url(#normalBg)';

  const strokeColor = isWild
    ? '#e74c3c'
    : highlighted
      ? 'var(--game-accent)'
      : 'var(--border-light)';

  const dotColor = isWild
    ? '#fff'
    : highlighted
      ? 'var(--game-accent)'
      : 'var(--text-primary)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label={`Die showing ${value}${isWild ? ' (wild)' : ''}`}
      role="img"
      style={{
        filter: highlighted
          ? 'drop-shadow(0 0 6px var(--game-accent))'
          : isWild
            ? 'drop-shadow(0 0 5px rgba(231,76,60,0.5))'
            : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
      }}
    >
      <defs>
        <linearGradient id="normalBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2a2545" />
          <stop offset="100%" stopColor="#1a1730" />
        </linearGradient>
        <linearGradient id="highlightBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2a2545" />
          <stop offset="100%" stopColor="#251f3a" />
        </linearGradient>
        <linearGradient id="wildBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3d1a1a" />
          <stop offset="100%" stopColor="#2a1010" />
        </linearGradient>
        {/* Inner highlight for 3D effect */}
        <linearGradient id="innerShine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>

      {/* Die body */}
      <rect
        x="4" y="4" width="92" height="92"
        rx="16" ry="16"
        fill={bgGradient}
        stroke={strokeColor}
        strokeWidth={highlighted || isWild ? 2.5 : 1.5}
      />

      {/* Inner shine for depth */}
      <rect
        x="6" y="6" width="88" height="44"
        rx="14" ry="14"
        fill="url(#innerShine)"
      />

      {/* Dots */}
      {dots.map(([cx, cy], i) => (
        <g key={i}>
          {/* Dot shadow */}
          <circle cx={cx} cy={cy + 1} r={9} fill="rgba(0,0,0,0.3)" />
          {/* Dot */}
          <circle cx={cx} cy={cy} r={8} fill={dotColor} opacity={0.95} />
        </g>
      ))}

      {/* Wild indicator star */}
      {isWild && (
        <text
          x="84" y="20"
          fontSize="16"
          textAnchor="middle"
          fill="#e74c3c"
          style={{ filter: 'drop-shadow(0 0 2px rgba(231,76,60,0.8))' }}
        >
          ★
        </text>
      )}
    </svg>
  );
}
