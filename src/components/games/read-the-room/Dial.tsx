'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { ReadTheRoomPair } from '@/types/games/read-the-room';
import { RTR_BAND_WIDTH, clampPosition, scoreNeedle } from '@/types/games/read-the-room';

// ---- Geometry (viewBox 200 × 112, pivot at the bottom center) ----
// A Scale value v sits at the angle 180° − 1.8 × v: 0 is far left, 100 far right.

const VIEW_W = 200;
const VIEW_H = 112;
const CX = 100;
const CY = 104;
const R_OUTER = 92;
const R_FACE = 30;
const R_ZONE = 36;
/** The needle stops short of the band numbers, so a bullseye never hides the "4". */
const NEEDLE_LENGTH = R_OUTER - 24;
const LABEL_RADIUS = R_OUTER - 10;
const KEY_RELEASE_MS = 500;

const HALF = RTR_BAND_WIDTH / 2;
/** The five bands around the Target, worth 2, 3, 4, 3 and 2 points. */
const BANDS = [
  { from: -HALF - 2 * RTR_BAND_WIDTH, to: -HALF - RTR_BAND_WIDTH, points: 2 },
  { from: -HALF - RTR_BAND_WIDTH, to: -HALF, points: 3 },
  { from: -HALF, to: HALF, points: 4 },
  { from: HALF, to: HALF + RTR_BAND_WIDTH, points: 3 },
  { from: HALF + RTR_BAND_WIDTH, to: HALF + 2 * RTR_BAND_WIDTH, points: 2 },
] as const;

function point(value: number, radius: number): [number, number] {
  const angle = Math.PI * (1 - value / 100);
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

function fmt(n: number): string {
  return n.toFixed(2);
}

/** Ring segment between two Scale values. */
function wedge(from: number, to: number, inner: number, outer: number): string {
  const [x1, y1] = point(from, outer);
  const [x2, y2] = point(to, outer);
  const [x3, y3] = point(to, inner);
  const [x4, y4] = point(from, inner);
  return `M ${fmt(x1)} ${fmt(y1)} A ${outer} ${outer} 0 0 1 ${fmt(x2)} ${fmt(y2)} `
    + `L ${fmt(x3)} ${fmt(y3)} A ${inner} ${inner} 0 0 0 ${fmt(x4)} ${fmt(y4)} Z`;
}

const TRACK = wedge(0, 100, R_FACE, R_OUTER);
const TICKS = Array.from({ length: 11 }, (_, i) => {
  const value = i * 10;
  const [x1, y1] = point(value, R_OUTER - (value === 50 ? 9 : 5));
  const [x2, y2] = point(value, R_OUTER - 1);
  return { value, x1, y1, x2, y2 };
});

/** The band the Needle landed in (index into BANDS), or null outside the Target Zone. */
function bandIndex(needle: number, target: number): number | null {
  const points = scoreNeedle(needle, target);
  if (points === 0) return null;
  if (points === 4) return 2;
  const leftOfTarget = needle < target;
  if (points === 3) return leftOfTarget ? 1 : 3;
  return leftOfTarget ? 0 : 4;
}

function valueFromPointer(svg: SVGSVGElement, clientX: number, clientY: number): number {
  const rect = svg.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * VIEW_W;
  const y = ((clientY - rect.top) / rect.height) * VIEW_H;
  let angle = Math.atan2(CY - y, x - CX);
  if (angle < 0) angle = x < CX ? Math.PI : 0;   // below the pivot: the nearer end
  return clampPosition((1 - angle / Math.PI) * 100);
}

interface DialProps {
  pair: ReadTheRoomPair | null;
  position: number;
  /** This player may move the dial right now */
  canDrag?: boolean;
  onMove?: (value: number) => void;
  onRelease?: (value: number) => void;
  /** Draw the Target Zone (Clue-giver, peek, reveal) */
  target?: number | null;
  zoneOpening?: boolean;
  /** Light up the band under the Needle (reveal) */
  showHit?: boolean;
  /** Someone holds the dial: it glows */
  live?: boolean;
  /** Shown under the labels while someone else holds it */
  holderName?: string | null;
  /** The needle sways while a clue is being written */
  thinking?: boolean;
  /** Shrink on short screens */
  compact?: boolean;
}

export default function Dial({
  pair, position, canDrag = false, onMove, onRelease, target = null, zoneOpening = false,
  showHit = false, live = false, holderName = null, thinking = false, compact = false,
}: DialProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointerDown = useRef(false);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => {
    if (keyTimer.current) clearTimeout(keyTimer.current);
  }, []);

  const valueAt = (e: PointerEvent) => (svgRef.current ? valueFromPointer(svgRef.current, e.clientX, e.clientY) : position);

  const endDrag = () => {
    pointerDown.current = false;
    setDragging(false);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!canDrag || !onMove) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerDown.current = true;
    setDragging(true);
    onMove(valueAt(e));
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointerDown.current) return;
    if (!canDrag) {
      endDrag();   // someone else got the dial
      return;
    }
    onMove?.(valueAt(e));
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointerDown.current) return;
    const value = valueAt(e);
    endDrag();
    if (canDrag) onRelease?.(value);
  };

  // The browser took the pointer away (scroll, system gesture): let go where the needle is
  const handlePointerCancel = () => {
    if (!pointerDown.current) return;
    endDrag();
    if (canDrag) onRelease?.(position);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canDrag || !onMove) return;
    const step = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = position - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = position + step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === null) return;
    e.preventDefault();
    const value = clampPosition(next);
    onMove(value);
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(() => onRelease?.(value), KEY_RELEASE_MS);
  };

  const showZone = target !== null;
  const hit = showZone && showHit ? bandIndex(position, target) : null;
  const rounded = Math.round(position);
  const valueText = !pair
    ? `${rounded}`
    : rounded === 50 ? `${rounded}, the middle` : `${rounded}, closer to ${rounded < 50 ? pair.left : pair.right}`;

  return (
    <div
      className={`rtr-dial ${compact ? 'rtr-compact' : ''} ${live ? 'rtr-dial-live' : ''} ${canDrag ? 'rtr-dial-grab' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
    >
      <div
        role="slider"
        tabIndex={canDrag ? 0 : -1}
        aria-label={pair ? `Dial from ${pair.left} to ${pair.right}` : 'Dial'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={valueText}
        aria-disabled={canDrag ? undefined : true}
        onKeyDown={handleKeyDown}
        className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-(--game-accent)"
      >
        <svg ref={svgRef} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="rtr-dial-svg block w-full overflow-visible" aria-hidden="true">
          <path d={TRACK} fill="var(--rtr-face)" stroke="var(--rtr-track)" strokeWidth="1" />

          {/* Ticks under the Target Zone, so the zone's numbers stay clean */}
          {TICKS.map(t => (
            <line
              key={t.value}
              x1={fmt(t.x1)}
              y1={fmt(t.y1)}
              x2={fmt(t.x2)}
              y2={fmt(t.y2)}
              stroke="var(--text-muted)"
              strokeWidth={t.value === 50 ? 1.4 : 1}
              strokeLinecap="round"
            />
          ))}

          {showZone && (
            <g key={target} className={zoneOpening ? 'rtr-zone-open' : undefined}>
              {BANDS.map((band, i) => (
                <path
                  key={i}
                  d={wedge(target + band.from, target + band.to, R_ZONE, R_OUTER - 1)}
                  fill={`var(--rtr-band-${band.points})`}
                  stroke={hit === i ? 'var(--text-primary)' : 'var(--rtr-face)'}
                  strokeWidth={hit === i ? 1.4 : 0.6}
                  className={hit === i ? 'rtr-band-hit' : undefined}
                />
              ))}
              {BANDS.map((band, i) => {
                const [x, y] = point(target + (band.from + band.to) / 2, LABEL_RADIUS);
                return (
                  <text
                    key={`label-${i}`}
                    x={fmt(x)}
                    y={fmt(y)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="7"
                    fontWeight="700"
                    fill="var(--bg-primary)"
                  >
                    {band.points}
                  </text>
                );
              })}
            </g>
          )}

          <g
            className={thinking ? 'rtr-thinking' : `rtr-needle ${dragging ? 'rtr-needle-direct' : ''}`}
            style={thinking ? undefined : { transform: `rotate(${(position - 50) * 1.8}deg)` }}
          >
            <line x1={CX} y1={CY} x2={CX} y2={CY - NEEDLE_LENGTH} stroke="var(--rtr-needle)" strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx={CX} cy={CY} r="7" fill="var(--rtr-needle)" />
          <circle cx={CX} cy={CY} r="3" fill="var(--game-accent)" />
        </svg>
      </div>

      {pair ? (
        <div className="mt-1.5 flex items-start justify-between gap-4 px-1" aria-hidden="true">
          <span className="max-w-[46%] text-left text-sm font-semibold leading-tight text-(--text-primary)">
            {/* Non-breaking spaces: an arrow never wraps onto a line by itself */}
            <span className="text-(--text-muted)">←{'\u00a0'}</span>{pair.left}
          </span>
          <span className="max-w-[46%] text-right text-sm font-semibold leading-tight text-(--text-primary)">
            {pair.right}<span className="text-(--text-muted)">{'\u00a0'}→</span>
          </span>
        </div>
      ) : (
        <div className="mt-1.5 h-5" aria-hidden="true" />
      )}

      {holderName && (
        <p className="mt-2 text-center text-xs font-semibold text-(--game-accent)" role="status">
          ✋ {holderName} {holderName === 'You' ? 'are' : 'is'} turning the dial
        </p>
      )}
    </div>
  );
}
