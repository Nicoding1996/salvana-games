'use client';

interface ActionAnimationProps {
  notification: {
    type: 'freeze' | 'flipThree';
    byId: string;
    byName: string;
    targetId: string;
    targetName: string;
  } | null;
  myId: string;
}

// Plays a one-shot "attack flying to target" effect when a Freeze or Flip Three
// is used. The root element is keyed on actor+target+type so each new action
// remounts and replays the CSS animations. The icon/burst fade themselves out
// via `forwards` keyframes; the persistent toast in Flip7Game keeps the label.
export default function ActionAnimation({ notification, myId }: ActionAnimationProps) {
  if (!notification) return null;

  const isFreeze = notification.type === 'freeze';
  const icon = isFreeze ? '❄️' : '⚡';
  const accent = isFreeze ? '#60a5fa' : '#fbbf24';

  const isSelf = notification.byId === notification.targetId;
  const byLabel = notification.byId === myId ? 'You' : notification.byName;
  const targetLabel = notification.targetId === myId ? 'you' : notification.targetName;
  const verb = isFreeze ? 'froze' : 'zapped';
  // Self-target: "You froze yourself!" / "Alice froze themselves!"
  const selfTargetLabel = notification.byId === myId ? 'yourself' : 'themselves';

  const key = `${notification.byId}-${notification.targetId}-${notification.type}`;

  return (
    <div key={key} className="fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none">
      {/* Impact burst behind the icon */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute w-24 h-24 rounded-full flip7-impact-burst"
          style={{ backgroundColor: `${accent}40`, border: `2px solid ${accent}` }}
        />
        <div className="text-6xl flip7-action-fly" style={{ filter: `drop-shadow(0 0 12px ${accent})` }}>
          {icon}
        </div>
      </div>

      {/* Label */}
      <div
        className="mt-6 px-4 py-2 rounded-full text-sm font-bold flip7-label-out"
        style={{ backgroundColor: `${accent}1f`, color: accent, border: `1px solid ${accent}55` }}
      >
        {byLabel} {verb} {isSelf ? selfTargetLabel : targetLabel}!
      </div>
    </div>
  );
}
