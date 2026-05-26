'use client';

import type { CellState } from '@/types/games/battleship';

interface GridCellProps {
  state: CellState;
  row: number;
  col: number;
  onTap?: (row: number, col: number) => void;
  disabled?: boolean;
  highlight?: boolean;
  sonarMode?: boolean;
  shipColor?: { bg: string; border: string; mini: string };
  size?: number;
}

export default function GridCell({ state, row, col, onTap, disabled, highlight, sonarMode, shipColor, size = 44 }: GridCellProps) {
  const handleTap = () => {
    if (!disabled && onTap) {
      onTap(row, col);
    }
  };

  const baseClasses = 'rounded-[3px] border transition-all flex items-center justify-center relative overflow-hidden';

  let stateClasses = '';
  let content: React.ReactNode = null;

  switch (state) {
    case 'empty':
      stateClasses = 'bg-gradient-to-br from-[#1a1f3a]/80 to-[#141828]/80 border-[#2a3050]/60';
      if (!disabled && onTap) {
        stateClasses += ' active:bg-[#1e3a5f]/40 active:border-[#00d4ff]/40';
      }
      break;
    case 'ship':
      // Ship on my grid — color-coded per ship type
      if (shipColor) {
        stateClasses = `border-[${shipColor.border}]/40`;
        content = (
          <div
            className="w-[60%] h-[60%] rounded-[2px] opacity-90"
            style={{ backgroundColor: shipColor.bg, border: `1px solid ${shipColor.border}50` }}
          />
        );
      } else {
        stateClasses = 'bg-gradient-to-br from-[#0e7490] to-[#065f73] border-[#22d3ee]/40';
        content = (
          <div className="w-[60%] h-[60%] rounded-[2px] bg-[#22d3ee]/30 border border-[#22d3ee]/50" />
        );
      }
      break;
    case 'hit':
      // Hit — bright orange/red fire indicator
      stateClasses = 'bg-gradient-to-br from-[#7f1d1d] to-[#450a0a] border-[#ef4444]/60';
      content = (
        <div className="flex items-center justify-center w-full h-full">
          <div className="relative">
            <div className="w-[55%] h-[55%] absolute inset-0 m-auto rounded-full bg-[#f97316] opacity-60 blur-[2px]" />
            <svg viewBox="0 0 24 24" className="w-[65%] h-[65%] relative" style={{ margin: 'auto', display: 'block', width: '65%', height: '65%' }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" fill="none"/>
              <circle cx="12" cy="12" r="4" fill="#f97316" />
              <circle cx="12" cy="12" r="2" fill="#fbbf24" />
            </svg>
          </div>
        </div>
      );
      break;
    case 'miss':
      // Miss — subtle water splash dot
      stateClasses = 'bg-gradient-to-br from-[#1a1f3a]/60 to-[#141828]/60 border-[#2a3050]/40';
      content = (
        <div className="w-[35%] h-[35%] rounded-full bg-[#64748b]/40 border border-[#94a3b8]/20" />
      );
      break;
    case 'sunk':
      // Sunk — dark red with skull/X, clearly destroyed
      stateClasses = 'bg-gradient-to-br from-[#991b1b] to-[#7f1d1d] border-[#dc2626]/70';
      content = (
        <div className="flex items-center justify-center w-full h-full">
          <svg viewBox="0 0 20 20" className="w-[70%] h-[70%]" style={{ width: '70%', height: '70%' }}>
            <line x1="4" y1="4" x2="16" y2="16" stroke="#fca5a5" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="16" y1="4" x2="4" y2="16" stroke="#fca5a5" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
      );
      break;
  }

  if (highlight) {
    stateClasses += ' ring-2 ring-[#4ade80]/70 ring-offset-1 ring-offset-[#0a0a10]';
  }

  if (sonarMode && state === 'empty' && !disabled) {
    stateClasses += ' border-[#4ade80]/30';
  }

  return (
    <button
      onClick={handleTap}
      disabled={disabled || !onTap}
      className={`${baseClasses} ${stateClasses} ${disabled && state === 'empty' ? 'opacity-40' : ''}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      aria-label={`Cell ${String.fromCharCode(65 + col)}${row + 1} - ${state}`}
    >
      {content}
    </button>
  );
}
