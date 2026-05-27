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
  isNew?: boolean; // true when this cell just changed state (for impact animation)
}

export default function GridCell({ state, row, col, onTap, disabled, highlight, sonarMode, shipColor, size = 44, isNew }: GridCellProps) {
  const handleTap = () => {
    if (!disabled && onTap) {
      onTap(row, col);
    }
  };

  const baseClasses = 'rounded-[3px] border transition-all flex items-center justify-center relative overflow-hidden';

  let stateClasses = '';
  let content: React.ReactNode = null;
  let animClass = '';

  switch (state) {
    case 'empty':
      stateClasses = 'bg-gradient-to-br from-[#0d1225]/90 to-[#0a0f1e]/90 border-[#1e2a4a]/50';
      if (!disabled && onTap) {
        stateClasses += ' active:bg-[#1e3a5f]/40 active:border-[#00d4ff]/40 active:scale-95';
      }
      break;

    case 'ship':
      // Ship on my grid — color-coded with subtle inner glow
      if (shipColor) {
        stateClasses = `border-[${shipColor.border}]/30`;
        content = (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className="w-[70%] h-[70%] rounded-[3px]"
              style={{
                backgroundColor: shipColor.bg,
                boxShadow: `0 0 6px ${shipColor.bg}40, inset 0 1px 2px rgba(255,255,255,0.15)`,
                border: `1px solid ${shipColor.border}60`,
              }}
            />
          </div>
        );
      } else {
        stateClasses = 'bg-gradient-to-br from-[#0e7490] to-[#065f73] border-[#22d3ee]/30';
        content = (
          <div className="w-[70%] h-[70%] rounded-[3px] bg-[#22d3ee]/25 border border-[#22d3ee]/40"
            style={{ boxShadow: '0 0 6px rgba(34,211,238,0.2), inset 0 1px 2px rgba(255,255,255,0.1)' }}
          />
        );
      }
      break;

    case 'hit':
      // Hit — animated fire glow
      stateClasses = 'bg-gradient-to-br from-[#7f1d1d] to-[#3b0a0a] border-[#ef4444]/50';
      animClass = isNew ? 'animate-cell-impact' : '';
      content = (
        <div className="flex items-center justify-center w-full h-full animate-fire-flicker">
          {/* Outer glow */}
          <div className="absolute inset-0 rounded-[3px]"
            style={{ boxShadow: 'inset 0 0 8px rgba(249,115,22,0.4), 0 0 4px rgba(249,115,22,0.3)' }}
          />
          {/* Fire core */}
          <div className="relative w-[50%] h-[50%]">
            <div className="absolute inset-0 rounded-full bg-[#f97316] opacity-80 blur-[1px]" />
            <div className="absolute inset-[20%] rounded-full bg-[#fbbf24] opacity-90" />
          </div>
        </div>
      );
      break;

    case 'miss':
      // Miss — ocean blue with ripple ring
      stateClasses = 'bg-gradient-to-br from-[#0c1929]/80 to-[#0a1420]/80 border-[#1e3a5a]/40';
      animClass = isNew ? 'animate-cell-impact' : '';
      content = (
        <div className="flex items-center justify-center w-full h-full relative">
          {/* Ripple ring */}
          {isNew && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[80%] h-[80%] rounded-full border-[1.5px] border-[#38bdf8]/50 animate-water-ripple" />
            </div>
          )}
          {/* Center dot */}
          <div className="w-[30%] h-[30%] rounded-full bg-[#475569]/50 border border-[#64748b]/30"
            style={{ boxShadow: '0 0 3px rgba(56,189,248,0.15)' }}
          />
        </div>
      );
      break;

    case 'sunk':
      // Sunk — charred wreckage with faint smoke
      stateClasses = 'bg-gradient-to-br from-[#450a0a] to-[#1c0505] border-[#991b1b]/60';
      content = (
        <div className="flex items-center justify-center w-full h-full relative">
          {/* Smoke particle */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[40%] h-[40%] rounded-full bg-[#6b7280]/30 animate-smoke-drift" />
          {/* X mark */}
          <svg viewBox="0 0 20 20" className="w-[60%] h-[60%] relative" style={{ width: '60%', height: '60%' }}>
            <line x1="4" y1="4" x2="16" y2="16" stroke="#fca5a5" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="16" y1="4" x2="4" y2="16" stroke="#fca5a5" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          {/* Inner glow */}
          <div className="absolute inset-0 rounded-[3px]"
            style={{ boxShadow: 'inset 0 0 6px rgba(220,38,38,0.3)' }}
          />
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
      className={`${baseClasses} ${stateClasses} ${animClass} ${disabled && state === 'empty' ? 'opacity-40' : ''}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      aria-label={`Cell ${String.fromCharCode(65 + col)}${row + 1} - ${state}`}
    >
      {content}
    </button>
  );
}
