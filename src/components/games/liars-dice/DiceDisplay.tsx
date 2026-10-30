'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LD_AUTO_ROLL_MS, countMatches } from '@/types/games/liars-dice';
import DiceIcon from './DiceIcon';

const TUMBLE_MS = 950;
const SHAKE_THRESHOLD = 24; // m/s² including gravity

type MotionPermission = 'granted' | 'denied' | 'needs-tap';

type MotionEventWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

function detectMotion(): MotionPermission {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return 'denied';
  const DME = window.DeviceMotionEvent as MotionEventWithPermission;
  return typeof DME.requestPermission === 'function' ? 'needs-tap' : 'granted';
}

function randomFaces(n: number): number[] {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1);
}

interface DiceDisplayProps {
  dice: number[];
  rollingPhase: boolean;      // the round's rolling phase is on
  alreadyRolled: boolean;     // the server has my roll (e.g. after a reconnect)
  wildOnes: boolean;
  focusFace: number | null;   // face to highlight (current bid, or the face being bid)
  waitingFor: string[];       // names still rolling
  onRollComplete: () => void;
  compactOnShortScreens?: boolean; // the bid builder is open: smaller tray on short phones
}

/** Your five dice: shake (or tap) to roll in the rolling phase, then matches light up while bidding. */
export default function DiceDisplay({
  dice, rollingPhase, alreadyRolled, wildOnes, focusFace, waitingFor, onRollComplete, compactOnShortScreens = false,
}: DiceDisplayProps) {
  const [tumbling, setTumbling] = useState(false);
  const [rolledLocal, setRolledLocal] = useState(false);
  const [faces, setFaces] = useState<number[]>(() => randomFaces(dice.length || 5));
  // Phones that don't need a permission prompt (Android) can shake straight away; iOS asks first
  const [motion, setMotion] = useState<MotionPermission>(detectMotion);
  const startedRef = useRef(false);

  // New round: allow a fresh roll (adjusting state while rendering)
  const [prevRolling, setPrevRolling] = useState(rollingPhase);
  if (rollingPhase !== prevRolling) {
    setPrevRolling(rollingPhase);
    if (rollingPhase) {
      setRolledLocal(false);
      setTumbling(false);
    }
  }
  useEffect(() => {
    if (rollingPhase) startedRef.current = false;
  }, [rollingPhase]);

  const rolled = rolledLocal || alreadyRolled || !rollingPhase;

  const roll = useCallback(() => {
    if (startedRef.current || !rollingPhase || alreadyRolled) return;
    startedRef.current = true;
    setTumbling(true);
    navigator.vibrate?.([30, 40, 30, 40, 60]);
  }, [rollingPhase, alreadyRolled]);

  // Tumble: faces flicker, then land on the real roll
  useEffect(() => {
    if (!tumbling) return;
    const flicker = setInterval(() => setFaces(randomFaces(5)), 85);
    const land = setTimeout(() => {
      clearInterval(flicker);
      setTumbling(false);
      setRolledLocal(true);
      navigator.vibrate?.(25);
      onRollComplete();
    }, TUMBLE_MS);
    return () => {
      clearInterval(flicker);
      clearTimeout(land);
    };
  }, [tumbling, onRollComplete]);

  const askMotion = async () => {
    const DME = window.DeviceMotionEvent as MotionEventWithPermission;
    try {
      const res = await DME.requestPermission?.();
      setMotion(res === 'granted' ? 'granted' : 'denied');
    } catch {
      setMotion('denied');
    }
  };

  // Shake to roll
  useEffect(() => {
    if (!rollingPhase || rolled || motion !== 'granted') return;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const magnitude = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      if (magnitude > SHAKE_THRESHOLD) roll();
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [rollingPhase, rolled, motion, roll]);

  // Nobody waits on a forgotten phone: roll automatically
  useEffect(() => {
    if (!rollingPhase || rolled) return;
    const t = setTimeout(roll, LD_AUTO_ROLL_MS);
    return () => clearTimeout(t);
  }, [rollingPhase, rolled, roll]);

  const sorted = [...dice].sort((a, b) => a - b);
  const showHidden = rollingPhase && !rolled && !tumbling;
  const shown = tumbling ? faces : sorted;
  const matches = focusFace ? countMatches(sorted, focusFace, wildOnes) : 0;

  return (
    <section className={`flex flex-col items-center gap-2 px-4 ${compactOnShortScreens ? 'ld-compact' : ''}`} aria-label="Your dice">
      <div className="ld-dice-label flex w-full items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-(--text-muted)">Your dice · only you can see them</p>
        {!rollingPhase && focusFace && (
          <span className="flex items-center gap-1 rounded-full bg-(--game-accent-dim) px-2 py-0.5 text-[11px] font-semibold text-(--game-accent)">
            You hold {matches}
            <DiceIcon value={focusFace} size={14} wild={wildOnes} />
          </span>
        )}
      </div>

      <div className={`ld-tray flex w-full justify-center gap-2 rounded-2xl px-3 py-3 ${tumbling ? 'animate-dice-roll' : ''}`}>
        {(shown.length ? shown : [1, 2, 3, 4, 5]).map((value, i) => (
          <DiceIcon
            key={`${i}-${rolled ? 'up' : 'down'}`}
            value={value}
            size={48}
            hidden={showHidden || dice.length === 0}
            wild={wildOnes && !tumbling}
            highlighted={!tumbling && !rollingPhase && !!focusFace && countMatches([value], focusFace, wildOnes) > 0}
            dim={!tumbling && !rollingPhase && !!focusFace && countMatches([value], focusFace, wildOnes) === 0}
            className={tumbling ? 'ld-die-tumble' : rolled && rollingPhase ? 'ld-die-land' : ''}
            style={tumbling ? { animationDelay: `${i * 40}ms` } : rolled && rollingPhase ? { animationDelay: `${i * 60}ms` } : undefined}
          />
        ))}
      </div>

      {rollingPhase && !rolled && !tumbling && (
        <div className="flex w-full flex-col items-center gap-2">
          <button
            type="button"
            onClick={roll}
            className="h-14 w-full rounded-2xl bg-(--game-accent) font-heading text-base font-semibold text-(--bg-primary) shadow-lg transition-transform active:scale-[0.97] ld-roll-btn"
          >
            🎲 Tap to roll
          </button>
          {motion === 'granted' && <p className="text-xs text-(--text-muted)">…or give your phone a shake</p>}
          {motion === 'needs-tap' && (
            <button type="button" onClick={askMotion} className="min-h-11 px-3 text-xs text-(--text-secondary) underline-offset-2 hover:underline">
              📱 Turn on shake to roll
            </button>
          )}
        </div>
      )}
      {rollingPhase && tumbling && <p className="text-sm text-(--text-secondary) animate-soft-pulse">Rolling…</p>}
      {rollingPhase && rolled && !tumbling && (
        <p className="text-xs text-(--text-muted)" role="status">
          {waitingFor.length > 0 ? `Waiting for ${waitingFor.join(', ')} to roll…` : 'Everyone has rolled'}
        </p>
      )}
    </section>
  );
}
