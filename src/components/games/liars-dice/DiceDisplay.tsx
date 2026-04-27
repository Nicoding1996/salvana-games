'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import DiceIcon from './DiceIcon';

interface DiceDisplayProps {
  dice: number[];
  phase: string;
  wildOnes: boolean;
  onRollComplete: () => void;
}

export default function DiceDisplay({ dice, phase, wildOnes, onRollComplete }: DiceDisplayProps) {
  const [rolling, setRolling] = useState(false);
  const [rolled, setRolled] = useState(false);
  const [motionPermission, setMotionPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const shakeDetected = useRef(false);
  const autoRollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRollingPhase = phase === 'rolling';

  // Request DeviceMotion permission (iOS)
  const requestMotionPermission = useCallback(async () => {
    const DME = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof DME?.requestPermission === 'function') {
      try {
        const result = await DME.requestPermission();
        setMotionPermission(result);
        return result === 'granted';
      } catch {
        setMotionPermission('denied');
        return false;
      }
    }
    // Non-iOS — permission not needed
    setMotionPermission('granted');
    return true;
  }, []);

  const triggerRoll = useCallback(() => {
    if (rolled || !isRollingPhase) return;
    shakeDetected.current = true;
    setRolling(true);

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate([30, 50, 30]);
    }

    // Roll animation duration
    setTimeout(() => {
      setRolling(false);
      setRolled(true);
      onRollComplete();
    }, 1500);
  }, [rolled, isRollingPhase, onRollComplete]);

  // Shake detection via DeviceMotion
  useEffect(() => {
    if (!isRollingPhase || rolled) return;

    const handleMotion = (e: DeviceMotionEvent) => {
      if (shakeDetected.current) return;
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;

      const magnitude = Math.sqrt(
        (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
      );

      if (magnitude > 25) {
        triggerRoll();
      }
    };

    if (motionPermission === 'granted') {
      window.addEventListener('devicemotion', handleMotion);
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [isRollingPhase, rolled, motionPermission, triggerRoll]);

  // Auto-roll fallback after 4s
  useEffect(() => {
    if (!isRollingPhase || rolled) return;

    autoRollTimer.current = setTimeout(() => {
      if (!shakeDetected.current) {
        triggerRoll();
      }
    }, 4500);

    return () => {
      if (autoRollTimer.current) {
        clearTimeout(autoRollTimer.current);
      }
    };
  }, [isRollingPhase, rolled, triggerRoll]);

  // Reset state on new round (phase changes to rolling)
  useEffect(() => {
    if (isRollingPhase) {
      setRolled(false);
      setRolling(false);
      shakeDetected.current = false;
    }
  }, [isRollingPhase]);

  // Sort dice for display: group same values together
  const sortedDice = [...dice].sort((a, b) => a - b);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Label */}
      <p className="text-[10px] uppercase tracking-wider text-(--text-muted)">Your Dice</p>

      {/* Dice tray */}
      <div
        className={`flex justify-center gap-2.5 px-4 py-3 rounded-2xl ${
          rolling ? 'animate-dice-roll' : ''
        }`}
        style={{
          background: 'linear-gradient(145deg, rgba(23,21,37,0.8), rgba(10,10,16,0.6))',
          border: '1px solid var(--border)',
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {sortedDice.map((value, i) => (
          <DiceIcon
            key={`${phase}-${i}`}
            value={value}
            size={52}
            hidden={isRollingPhase && !rolled}
            wild={wildOnes}
            className={rolled && isRollingPhase ? 'animate-fade-in' : ''}
          />
        ))}
      </div>

      {/* Roll controls (only during rolling phase) */}
      {isRollingPhase && !rolled && !rolling && (
        <div className="flex flex-col items-center gap-2 animate-fade-in">
          {motionPermission === 'prompt' && (
            <button
              onClick={requestMotionPermission}
              className="text-xs px-4 py-2 rounded-lg bg-(--bg-elevated) border border-(--border) text-(--text-secondary) active:scale-95 transition-transform"
            >
              📱 Enable shake to roll
            </button>
          )}

          <button
            onClick={triggerRoll}
            className="px-8 py-3.5 bg-(--game-accent) text-white rounded-xl font-semibold text-sm active:scale-95 transition-all shadow-lg"
            style={{ boxShadow: '0 4px 14px rgba(231,76,60,0.3)' }}
          >
            🎲 Tap to Roll
          </button>

          {motionPermission === 'granted' && (
            <p className="text-[10px] text-(--text-muted)">or shake your phone!</p>
          )}
        </div>
      )}

      {/* Rolling animation message */}
      {isRollingPhase && rolling && (
        <p className="text-xs text-(--text-secondary) animate-soft-pulse">
          Rolling...
        </p>
      )}

      {/* Waiting message after roll */}
      {isRollingPhase && rolled && !rolling && (
        <p className="text-xs text-(--text-muted) animate-soft-pulse">
          Waiting for others to roll...
        </p>
      )}
    </div>
  );
}
