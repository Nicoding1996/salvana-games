'use client';

interface FrozenSelfOverlayProps {
  // Bumped each time *this* player transitions into the frozen state. A change
  // remounts the element (via key) so the one-shot frost-in CSS replays.
  triggerKey: number;
}

// Full-screen "you got iced" reaction shown only to the player who was frozen.
// Frost vignette creeps in from the edges and a snowflake lands center, then the
// whole thing fades — the persistent card frost + toast keep the lasting state.
export default function FrozenSelfOverlay({ triggerKey }: FrozenSelfOverlayProps) {
  if (triggerKey === 0) return null;

  return (
    <div
      key={triggerKey}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
      aria-hidden="true"
    >
      <div className="absolute inset-0 flip7-self-frost" />
      <div
        className="text-7xl flip7-self-flake"
        style={{ filter: 'drop-shadow(0 0 16px #60a5fa)' }}
      >
        ❄️
      </div>
    </div>
  );
}
