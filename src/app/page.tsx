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
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-10 text-center animate-fade-in">
        <h1 className="text-4xl font-bold mb-2">
          🎮 <span className="bg-linear-to-r from-[#e94560] to-[#533483] bg-clip-text text-transparent">Social Games</span>
        </h1>
        <p className="text-(--text-secondary) text-sm">Party games on your phone</p>
      </div>

      {mode === 'home' && (
        <div className="w-full max-w-sm space-y-4 animate-slide-up">
          <button
            onClick={() => setMode('create')}
            className="w-full py-4 px-6 bg-(--accent) hover:bg-[#d63d56] rounded-2xl text-lg font-semibold transition-all active:scale-95"
            aria-label="Create a new game room"
          >
            Create Room
          </button>
          <button
            onClick={() => setMode('join')}
            className="w-full py-4 px-6 bg-(--bg-card) hover:bg-(--bg-secondary) border border-(--accent-secondary) rounded-2xl text-lg font-semibold transition-all active:scale-95"
            aria-label="Join an existing game room"
          >
            Join Room
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div className="w-full max-w-sm space-y-4 animate-slide-up">
          <label htmlFor="create-name" className="block text-sm text-(--text-secondary)">Your Name</label>
          <input
            id="create-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full py-4 px-5 bg-(--bg-card) rounded-2xl text-lg outline-none focus:ring-2 focus:ring-(--accent) placeholder:text-(--text-secondary)"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          {error && <p className="text-(--accent) text-sm" role="alert">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="w-full py-4 px-6 bg-(--accent) hover:bg-[#d63d56] disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-lg font-semibold transition-all active:scale-95"
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>
          <button
            onClick={() => { setMode('home'); setError(null); }}
            className="w-full py-3 text-(--text-secondary) text-sm"
          >
            ← Back
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="w-full max-w-sm space-y-4 animate-slide-up">
          <label htmlFor="join-name" className="block text-sm text-(--text-secondary)">Your Name</label>
          <input
            id="join-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full py-4 px-5 bg-(--bg-card) rounded-2xl text-lg outline-none focus:ring-2 focus:ring-(--accent) placeholder:text-(--text-secondary)"
            autoFocus
          />
          <label htmlFor="join-code" className="block text-sm text-(--text-secondary)">Room Code</label>
          <input
            id="join-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="ABCD"
            maxLength={4}
            className="w-full py-4 px-5 bg-(--bg-card) rounded-2xl text-2xl text-center tracking-[0.3em] font-mono outline-none focus:ring-2 focus:ring-(--accent) placeholder:text-(--text-secondary) uppercase"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          {error && <p className="text-(--accent) text-sm" role="alert">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={!name.trim() || code.length !== 4 || loading}
            className="w-full py-4 px-6 bg-(--accent) hover:bg-[#d63d56] disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-lg font-semibold transition-all active:scale-95"
          >
            {loading ? 'Joining...' : 'Join Room'}
          </button>
          <button
            onClick={() => { setMode('home'); setError(null); }}
            className="w-full py-3 text-(--text-secondary) text-sm"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
