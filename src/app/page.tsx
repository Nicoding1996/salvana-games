'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRoom } from '@/lib/hub/useRoom';
import GameShowcase from '@/components/hub/GameShowcase';

export default function Home() {
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { createRoom, joinRoom, error, setError, leaveRoom, room } = useRoom();

  useEffect(() => {
    if (room) {
      leaveRoom();
    } else {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('playerName');
        sessionStorage.removeItem('roomCode');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const room = await createRoom(name.trim());
      router.push(`/room/${room.code}`);
    } catch {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!name.trim() || !code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const room = await joinRoom(code.trim(), name.trim());
      router.push(`/room/${room.code}`);
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center px-5 py-6 relative overflow-x-hidden overflow-y-auto">
      {/* Ambient particles */}
      <div className="ambient-particles" aria-hidden="true">
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />
        <div className="particle particle-5" />
        <div className="particle particle-6" />
      </div>

      {/* Hero Brand Section */}
      <div className="mb-6 text-center animate-fade-in relative z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-(--brand-dim) border border-(--brand)/20 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-(--brand) animate-soft-pulse" />
          <span className="text-[10px] font-medium text-(--brand)">Free · No downloads · Instant play</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight leading-tight">
          Salvana <span className="text-(--brand)">Games</span>
        </h1>
        <p className="text-(--text-secondary) text-sm mt-2.5 max-w-[280px] mx-auto leading-relaxed">
          Party games that run in your browser. One person creates a room, everyone else joins on their phone.
        </p>
      </div>

      {/* How It Works — 3-step strip */}
      {mode === 'home' && (
        <div className="w-full max-w-xs mb-6 animate-fade-in relative z-10">
          <div className="flex items-center justify-between gap-1">
            <Step number="1" label="Create" sublabel="a room" />
            <StepArrow />
            <Step number="2" label="Share" sublabel="the code" />
            <StepArrow />
            <Step number="3" label="Play" sublabel="together" />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {mode === 'home' && (
        <div className="w-full max-w-xs space-y-3 animate-slide-up mb-6 relative z-10">
          <button
            onClick={() => setMode('create')}
            className="w-full py-4 px-6 bg-(--brand) text-(--bg-primary) rounded-xl text-base font-semibold transition-all active:scale-[0.97] hover:brightness-110 shadow-lg shadow-(--brand)/10"
            aria-label="Create a new game room"
          >
            Create Room
          </button>
          <button
            onClick={() => setMode('join')}
            className="w-full py-4 px-6 bg-(--bg-card) border border-(--border) rounded-xl text-base font-semibold transition-all active:scale-[0.97] hover:border-(--brand)/50"
            aria-label="Join an existing game room"
          >
            Join Room
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div className="w-full max-w-xs space-y-4 animate-slide-up mb-6 relative z-10">
          <div>
            <label htmlFor="create-name" className="block text-xs text-(--text-secondary) mb-1.5 ml-1">Your Name</label>
            <input
              id="create-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              className="w-full py-3.5 px-4 bg-(--bg-card) border border-(--border) rounded-xl text-base outline-none focus:border-(--brand) transition-colors placeholder:text-(--text-muted)"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          {error && <p className="text-(--danger) text-sm ml-1" role="alert">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="w-full py-4 bg-(--brand) text-(--bg-primary) disabled:opacity-40 rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>
          <button
            onClick={() => { setMode('home'); setError(null); }}
            className="w-full py-2 text-(--text-secondary) text-sm"
          >
            ← Back
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="w-full max-w-xs space-y-4 animate-slide-up mb-6 relative z-10">
          <div>
            <label htmlFor="join-name" className="block text-xs text-(--text-secondary) mb-1.5 ml-1">Your Name</label>
            <input
              id="join-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              className="w-full py-3.5 px-4 bg-(--bg-card) border border-(--border) rounded-xl text-base outline-none focus:border-(--brand) transition-colors placeholder:text-(--text-muted)"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="join-code" className="block text-xs text-(--text-secondary) mb-1.5 ml-1">Room Code</label>
            <input
              id="join-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="ABCD"
              maxLength={4}
              className="w-full py-3.5 px-4 bg-(--bg-card) border border-(--border) rounded-xl text-xl text-center tracking-[0.3em] font-mono outline-none focus:border-(--brand) transition-colors placeholder:text-(--text-muted) uppercase"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>
          {error && <p className="text-(--danger) text-sm ml-1" role="alert">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={!name.trim() || code.length !== 4 || loading}
            className="w-full py-4 bg-(--brand) text-(--bg-primary) disabled:opacity-40 rounded-xl text-base font-semibold transition-all active:scale-[0.97]"
          >
            {loading ? 'Joining...' : 'Join Room'}
          </button>
          <button
            onClick={() => { setMode('home'); setError(null); }}
            className="w-full py-2 text-(--text-secondary) text-sm"
          >
            ← Back
          </button>
        </div>
      )}

      {/* Game Showcase */}
      <div className="w-full border-t border-(--border) pt-6 relative z-10">
        <GameShowcase />
      </div>
    </div>
  );
}

/* ============================================
   Sub-components
   ============================================ */

function Step({ number, label, sublabel }: { number: string; label: string; sublabel: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-8 h-8 rounded-full bg-(--bg-elevated) border border-(--border) flex items-center justify-center">
        <span className="text-xs font-bold text-(--brand)">{number}</span>
      </div>
      <span className="text-[11px] font-medium text-(--text-primary)">{label}</span>
      <span className="text-[9px] text-(--text-muted)">{sublabel}</span>
    </div>
  );
}

function StepArrow() {
  return (
    <div className="flex-1 flex items-center justify-center -mt-4">
      <div className="w-full h-px bg-(--border) relative">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-(--text-muted)" />
      </div>
    </div>
  );
}
