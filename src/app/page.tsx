'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoom } from '@/lib/hub/useRoom';

export default function Home() {
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { createRoom, joinRoom, error, setError } = useRoom();

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
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
      {/* Brand */}
      <div className="mb-12 text-center animate-fade-in">
        <p className="text-xs uppercase tracking-[0.25em] text-(--text-muted) mb-3">Welcome to</p>
        <h1 className="text-3xl font-bold tracking-tight">
          Salvana <span className="text-(--brand)">Games</span>
        </h1>
        <p className="text-(--text-secondary) text-sm mt-2">Party games on your phone</p>
      </div>

      {mode === 'home' && (
        <div className="w-full max-w-xs space-y-3 animate-slide-up">
          <button
            onClick={() => setMode('create')}
            className="w-full py-4 px-6 bg-(--brand) text-(--bg-primary) rounded-xl text-base font-semibold transition-all active:scale-[0.97] hover:brightness-110"
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
        <div className="w-full max-w-xs space-y-4 animate-slide-up">
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
        <div className="w-full max-w-xs space-y-4 animate-slide-up">
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
    </div>
  );
}
