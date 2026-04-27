'use client';

import { useState, useEffect } from 'react';
import DiceIcon from './DiceIcon';

interface BidPickerProps {
  currentBid: { quantity: number; faceValue: number } | null;
  totalDiceOnTable: number;
  onPlaceBid: (quantity: number, faceValue: number) => void;
  onCallLiar: () => void;
  onCallSpotOn?: () => void;
  spotOnEnabled: boolean;
}

export default function BidPicker({
  currentBid,
  totalDiceOnTable,
  onPlaceBid,
  onCallLiar,
  onCallSpotOn,
  spotOnEnabled,
}: BidPickerProps) {
  // Calculate minimum valid bid
  const minQuantity = currentBid ? currentBid.quantity : 1;
  const minFace = currentBid ? (currentBid.faceValue < 6 ? currentBid.faceValue + 1 : 1) : 1;
  const minQuantityForMinFace = currentBid
    ? (currentBid.faceValue < 6 ? currentBid.quantity : currentBid.quantity + 1)
    : 1;

  const [quantity, setQuantity] = useState(minQuantityForMinFace);
  const [faceValue, setFaceValue] = useState(currentBid ? (currentBid.faceValue < 6 ? currentBid.faceValue + 1 : 1) : 1);

  // Reset picker when current bid changes
  useEffect(() => {
    if (currentBid) {
      if (currentBid.faceValue < 6) {
        // Same quantity, next face value up
        setQuantity(currentBid.quantity);
        setFaceValue(currentBid.faceValue + 1);
      } else {
        // Face is 6 (max) — must increase quantity
        const nextQ = Math.min(currentBid.quantity + 1, totalDiceOnTable);
        setQuantity(nextQ);
        setFaceValue(1);
      }
    } else {
      setQuantity(1);
      setFaceValue(1);
    }
  }, [currentBid?.quantity, currentBid?.faceValue, totalDiceOnTable]);

  const isValidBid = () => {
    if (!currentBid) return quantity >= 1 && faceValue >= 1 && faceValue <= 6;
    if (quantity > currentBid.quantity) return true;
    if (quantity === currentBid.quantity && faceValue > currentBid.faceValue) return true;
    return false;
  };

  const handleQuantityChange = (delta: number) => {
    const newQ = Math.max(1, Math.min(totalDiceOnTable, quantity + delta));
    setQuantity(newQ);
  };

  const handleFaceSelect = (face: number) => {
    setFaceValue(face);
  };

  const handleSubmit = () => {
    if (isValidBid()) {
      onPlaceBid(quantity, faceValue);
    }
  };

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-2xl p-4 space-y-4">
      {/* Quantity selector */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => handleQuantityChange(-1)}
          disabled={quantity <= 1}
          className="w-12 h-12 rounded-xl bg-(--bg-elevated) border border-(--border) text-(--text-primary) text-xl font-bold disabled:opacity-30 active:scale-95 transition-transform"
          aria-label="Decrease quantity"
        >
          −
        </button>
        <div className="text-center min-w-[60px]">
          <span className="text-3xl font-bold text-(--text-primary)">{quantity}</span>
          <p className="text-[10px] text-(--text-muted) uppercase tracking-wider">dice</p>
        </div>
        <button
          onClick={() => handleQuantityChange(1)}
          disabled={quantity >= totalDiceOnTable}
          className="w-12 h-12 rounded-xl bg-(--bg-elevated) border border-(--border) text-(--text-primary) text-xl font-bold disabled:opacity-30 active:scale-95 transition-transform"
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>

      {/* Face value selector */}
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5, 6].map((face) => {
          const isSelected = faceValue === face;
          // A face is valid if it would make a valid bid at the current quantity
          const faceValid = !currentBid
            || quantity > currentBid.quantity
            || (quantity === currentBid.quantity && face > currentBid.faceValue);

          return (
            <button
              key={face}
              onClick={() => handleFaceSelect(face)}
              className={`p-1 rounded-lg transition-all active:scale-95 ${
                isSelected
                  ? 'ring-2 ring-(--game-accent) bg-(--bg-elevated)'
                  : faceValid
                    ? 'opacity-70 hover:opacity-100'
                    : 'opacity-20'
              }`}
              aria-label={`Select face value ${face}${!faceValid ? ' (too low)' : ''}`}
            >
              <DiceIcon value={face} size={40} highlighted={isSelected} />
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!isValidBid()}
          className="flex-1 py-3.5 bg-(--game-accent) text-white rounded-xl font-semibold text-sm disabled:opacity-30 active:scale-[0.97] transition-all"
        >
          Place Bid
        </button>

        {currentBid && (
          <button
            onClick={onCallLiar}
            className="flex-1 py-3.5 bg-(--danger) text-white rounded-xl font-semibold text-sm active:scale-[0.97] transition-all"
          >
            🤥 Liar!
          </button>
        )}

        {currentBid && spotOnEnabled && onCallSpotOn && (
          <button
            onClick={onCallSpotOn}
            className="py-3.5 px-4 bg-(--game-secondary) text-white rounded-xl font-semibold text-sm active:scale-[0.97] transition-all"
          >
            🎯
          </button>
        )}
      </div>

      {/* Bid preview */}
      {isValidBid() && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-(--text-muted)">
          <span>Bidding:</span>
          <span className="font-bold text-(--text-primary)">{quantity}</span>
          <span>×</span>
          <DiceIcon value={faceValue} size={20} />
        </div>
      )}
    </div>
  );
}
