'use client';

import { useState } from 'react';
import DiceIcon from './DiceIcon';

interface BidGridProps {
  currentBid: { quantity: number; faceValue: number } | null;
  totalDiceOnTable: number;
  onPlaceBid: (quantity: number, faceValue: number) => void;
  onCallLiar: () => void;
  onCallSpotOn?: () => void;
  spotOnEnabled: boolean;
  myDice: number[];
  wildOnes: boolean;
}

export default function BidGrid({
  currentBid,
  totalDiceOnTable,
  onPlaceBid,
  onCallLiar,
  onCallSpotOn,
  spotOnEnabled,
  myDice,
  wildOnes,
}: BidGridProps) {
  const [selectedFace, setSelectedFace] = useState<number | null>(null);

  // Calculate how many of each face I have (for display under dice)
  const myFaceCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  myDice.forEach(d => { myFaceCounts[d]++; });

  // Count matching dice for a face (including wilds)
  const getMyMatchCount = (face: number): number => {
    let count = myFaceCounts[face] || 0;
    if (wildOnes && face !== 1) {
      count += myFaceCounts[1] || 0;
    }
    return count;
  };

  // Check if a face is valid at any quantity (can we bid this face at all?)
  const isFaceValid = (face: number): boolean => {
    if (!currentBid) return true;
    // Valid if: same quantity + higher face, OR any higher quantity
    if (face > currentBid.faceValue) return true; // same qty, higher face
    if (currentBid.quantity < totalDiceOnTable) return true; // can increase qty
    return false;
  };

  // Get valid quantities for a selected face
  const getValidQuantities = (face: number): number[] => {
    const quantities: number[] = [];
    if (!currentBid) {
      // First bid — any quantity from 1 to totalDice
      for (let q = 1; q <= Math.min(totalDiceOnTable, 10); q++) {
        quantities.push(q);
      }
      return quantities;
    }

    // Same quantity is valid only if face > current face
    if (face > currentBid.faceValue) {
      quantities.push(currentBid.quantity);
    }

    // Higher quantities are always valid for any face
    const startQ = currentBid.quantity + 1;
    for (let q = startQ; q <= Math.min(totalDiceOnTable, currentBid.quantity + 8); q++) {
      quantities.push(q);
    }

    return quantities;
  };

  // Calculate danger level for a quantity
  const getDangerLevel = (quantity: number): number => {
    return Math.min(1, quantity / totalDiceOnTable);
  };

  // Overall tension level based on current bid
  const tensionLevel = currentBid
    ? getDangerLevel(currentBid.quantity)
    : 0;

  const handleFaceSelect = (face: number) => {
    if (!isFaceValid(face)) return;
    setSelectedFace(face === selectedFace ? null : face);
  };

  const handleQuantitySelect = (quantity: number) => {
    if (selectedFace === null) return;
    onPlaceBid(quantity, selectedFace);
    setSelectedFace(null);
  };

  const validQuantities = selectedFace !== null ? getValidQuantities(selectedFace) : [];

  return (
    <div className="space-y-3">
      {/* Danger meter */}
      {currentBid && (
        <div className="px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] uppercase tracking-wider text-(--text-muted)">Bid Tension</span>
            <span className="text-[9px] text-(--text-muted)">
              {currentBid.quantity}/{totalDiceOnTable} dice claimed
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-(--bg-primary) overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${tensionLevel * 100}%`,
                background: tensionLevel < 0.4
                  ? 'var(--success)'
                  : tensionLevel < 0.7
                    ? 'var(--game-secondary)'
                    : 'var(--danger)',
                boxShadow: tensionLevel > 0.6
                  ? '0 0 8px rgba(248, 113, 113, 0.5)'
                  : 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* Step 1: Face selector — 6 big dice buttons */}
      <div className="bg-(--bg-card) border border-(--border) rounded-2xl p-3">
        <p className="text-[9px] uppercase tracking-wider text-(--text-muted) text-center mb-2">
          {selectedFace ? 'Now pick quantity ↓' : 'Tap a face to bid'}
        </p>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5, 6].map(face => {
            const valid = isFaceValid(face);
            const isSelected = selectedFace === face;
            const matchCount = getMyMatchCount(face);

            return (
              <button
                key={face}
                disabled={!valid}
                onClick={() => handleFaceSelect(face)}
                className={`
                  flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all
                  ${isSelected
                    ? 'ring-2 ring-(--game-accent) bg-(--bg-elevated) scale-110'
                    : valid
                      ? 'active:scale-95 active:bg-(--bg-elevated)'
                      : 'opacity-20'
                  }
                `}
                aria-label={`Select face ${face}${!valid ? ' (invalid)' : ''}`}
              >
                <DiceIcon value={face} size={44} highlighted={isSelected} />
                <span className={`text-[9px] font-medium ${
                  isSelected ? 'text-(--game-accent)' : 'text-(--text-muted)'
                }`}>
                  ×{matchCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Quantity selector — appears when face is selected */}
      {selectedFace !== null && validQuantities.length > 0 && (
        <div className="bg-(--bg-card) border border-(--border) rounded-2xl p-3 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] uppercase tracking-wider text-(--text-muted)">
              How many {selectedFace}s?
            </p>
            <div className="flex items-center gap-1">
              <DiceIcon value={selectedFace} size={16} highlighted />
              <span className="text-[9px] text-(--text-muted)">
                you have {getMyMatchCount(selectedFace)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {validQuantities.map(qty => {
              const isMinRaise = currentBid
                ? (qty === currentBid.quantity && selectedFace > currentBid.faceValue) ||
                  (qty === currentBid.quantity + 1 && selectedFace <= currentBid.faceValue)
                : qty === 1;

              return (
                <button
                  key={qty}
                  onClick={() => handleQuantitySelect(qty)}
                  className={`
                    min-w-[44px] h-[44px] rounded-xl font-bold text-base transition-all
                    active:scale-90
                    ${isMinRaise
                      ? 'bg-(--game-accent)/20 border-2 border-(--game-accent) text-(--game-accent)'
                      : 'bg-(--bg-elevated) border border-(--border-light) text-(--text-primary)'
                    }
                  `}
                  aria-label={`Bid ${qty} × ${selectedFace}${isMinRaise ? ' (minimum raise)' : ''}`}
                >
                  {qty}
                </button>
              );
            })}
          </div>
          {/* Hint for minimum raise */}
          {currentBid && (
            <p className="text-[9px] text-(--text-muted) text-center mt-2">
              <span className="text-(--game-accent)">●</span> = minimum raise
            </p>
          )}
        </div>
      )}

      {/* Action buttons — Liar + Spot On */}
      {currentBid && (
        <div className="flex gap-2">
          <button
            onClick={onCallLiar}
            className="flex-1 py-4 rounded-xl font-bold text-base text-white active:scale-[0.95] transition-all"
            style={{
              background: tensionLevel > 0.6
                ? 'linear-gradient(135deg, #e74c3c, #c0392b)'
                : 'var(--danger)',
              boxShadow: tensionLevel > 0.6
                ? '0 4px 20px rgba(231, 76, 60, 0.4), 0 0 30px rgba(231, 76, 60, 0.15)'
                : '0 2px 8px rgba(231, 76, 60, 0.2)',
              transform: `scale(${1 + tensionLevel * 0.03})`,
            }}
          >
            🤥 LIAR!
          </button>

          {spotOnEnabled && onCallSpotOn && (
            <button
              onClick={onCallSpotOn}
              className="py-4 px-5 bg-(--game-secondary) text-white rounded-xl font-bold text-sm active:scale-[0.95] transition-all"
            >
              🎯
            </button>
          )}
        </div>
      )}
    </div>
  );
}
