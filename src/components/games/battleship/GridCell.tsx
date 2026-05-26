'use client';

import type { CellState } from '@/types/games/battleship';

interface GridCellProps {
  state: CellState;
  row: number;
  col: number;
  onTap?: (row: number, col: number) => void;
  disabled?: boolean;
  highlight?: boolean;
  size?: number;
}

export default function GridCell({ state, row, col, onTap, disabled, highlight, size = 44 }: GridCellProps) {
  const handleTap = () => {
    if (!disabled && onTap) {
      onTap(row, col);
    }
  };

  const baseClasses = 'rounded-sm border transition-all flex items-center justify-center';

  let stateClasses = '';
  let content = '';

  switch (state) {
    case 'empty':
      stateClasses = 'bg-(--bg-elevated)/50 border-(--border) active:bg-(--bg-elevated)';
      break;
    case 'ship':
      stateClasses = 'bg-(--game-accent)/30 border-(--game-accent)/50';
      content = '▪';
      break;
    case 'hit':
      stateClasses = 'bg-(--danger)/30 border-(--danger)/60';
      content = '💥';
      break;
    case 'miss':
      stateClasses = 'bg-(--bg-card) border-(--border-light)';
      content = '•';
      break;
    case 'sunk':
      stateClasses = 'bg-(--danger)/50 border-(--danger)';
      content = '🔥';
      break;
  }

  if (highlight) {
    stateClasses += ' ring-2 ring-(--game-accent) ring-offset-1 ring-offset-(--bg-primary)';
  }

  return (
    <button
      onClick={handleTap}
      disabled={disabled || !onTap}
      className={`${baseClasses} ${stateClasses} ${disabled ? 'opacity-60' : ''}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size, fontSize: size * 0.4 }}
      aria-label={`Cell ${String.fromCharCode(65 + col)}${row + 1} - ${state}`}
    >
      <span className="text-center leading-none">{content}</span>
    </button>
  );
}
