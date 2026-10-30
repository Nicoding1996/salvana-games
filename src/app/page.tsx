'use client';

import { useState, useEffect, useRef } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useRoom } from '@/lib/hub/useRoom';
import { GAME_REGISTRY } from '@/lib/gameRegistry';
import GameShowcase from '@/components/hub/GameShowcase';
import { AlertCircleIcon, ArrowLeftIcon, ChevronRightIcon, LogInIcon, PlusIcon } from '@/components/shared/Icons';

type Mode = 'home' | 'create' | 'join';

const NAME_MAX_LENGTH = 20;
const CODE_LENGTH = 4;

const INPUT_CLASS =
  'w-full h-13 px-4 rounded-xl bg-(--bg-elevated) border border-(--border-light) text-(--text-primary) outline-none ' +
  'transition-[border-color,box-shadow] placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-3 focus:ring-(--brand)/20';

export default function Home() {
  const [mode, setMode] = useState<Mode>('home');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const joinNameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { createRoom, joinRoom, error, setError, leaveRoom, room } = useRoom();

  // Landing on the home page always means "not in a room"
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

  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0;
  const canJoin = trimmedName.length > 0 && code.length === CODE_LENGTH;

  const goTo = (next: Mode) => {
    setError(null);
    setMode(next);
  };

  const handleNameChange = (value: string) => {
    if (error) setError(null);
    setName(value);
  };

  const handleCodeChange = (value: string) => {
    if (error) setError(null);
    const next = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH);
    // Code complete → hop to the name field
    if (next.length === CODE_LENGTH && code.length < CODE_LENGTH) {
      joinNameRef.current?.focus();
    }
    setCode(next);
  };

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canCreate || loading) return;
    setLoading(true);
    setError(null);
    try {
      const created = await createRoom(trimmedName);
      router.push(`/room/${created.code}`);
    } catch {
      setLoading(false);
    }
  };

  const handleJoin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canJoin || loading) return;
    setLoading(true);
    setError(null);
    try {
      const joined = await joinRoom(code, trimmedName);
      router.push(`/room/${joined.code}`);
    } catch {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center px-5 pt-6 pb-12 relative overflow-x-hidden">
      {/* Ambient particles */}
      <div className="ambient-particles" aria-hidden="true">
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />
        <div className="particle particle-5" />
        <div className="particle particle-6" />
      </div>

      {/* Hero */}
      <header className="relative z-10 w-full max-w-sm text-center">
        <HeroFan />
        <div className="mt-7 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-(--brand-dim) border border-(--brand)/20">
          <span className="w-1.5 h-1.5 rounded-full bg-(--brand) animate-soft-pulse" aria-hidden="true" />
          <span className="text-xs font-medium text-(--brand)">Free · No downloads · Instant play</span>
        </div>
        <h1 className="mt-3 text-[2.5rem] leading-[1.05] font-bold tracking-tight">
          Salvana <span className="text-(--brand) brand-glow">Games</span>
        </h1>
        <p className="mt-3 mx-auto max-w-[19rem] text-[15px] leading-relaxed text-balance text-(--text-secondary)">
          Grab your phones. Pick a game. Bluff, bet, and betray your friends — all from the browser.
        </p>
      </header>

      {/* Actions */}
      <div className="relative z-10 w-full max-w-sm mt-8">
        {mode === 'home' && (
          <div className="space-y-3 animate-slide-up">
            <button
              type="button"
              onClick={() => goTo('create')}
              className="group w-full min-h-16 px-4 py-3 rounded-2xl bg-(--brand) text-(--bg-primary) flex items-center gap-3 text-left cta-glow transition-[transform,filter] active:scale-[0.98] hover:brightness-110"
            >
              <span className="w-10 h-10 shrink-0 rounded-xl bg-(--bg-primary)/15 flex items-center justify-center" aria-hidden="true">
                <PlusIcon size={20} strokeWidth={2.5} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-heading text-base font-semibold">Create a room</span>
                <span className="block text-xs font-medium opacity-70">You&apos;ll be the host</span>
              </span>
              <ChevronRightIcon size={20} className="shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => goTo('join')}
              className="group w-full min-h-16 px-4 py-3 rounded-2xl bg-(--bg-card) border border-(--border-light) text-(--text-primary) flex items-center gap-3 text-left transition-[transform,border-color] active:scale-[0.98] hover:border-(--brand)/40"
            >
              <span className="w-10 h-10 shrink-0 rounded-xl bg-(--bg-elevated) border border-(--border-light) text-(--brand) flex items-center justify-center" aria-hidden="true">
                <LogInIcon size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-heading text-base font-semibold">Join a room</span>
                <span className="block text-xs text-(--text-secondary)">Enter the 4-letter code</span>
              </span>
              <ChevronRightIcon size={20} className="shrink-0 text-(--text-muted) transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} noValidate aria-busy={loading} className="home-panel rounded-3xl p-5 animate-slide-up">
            <PanelHeader title="Create a room" subtitle="You'll get a code to share with your friends." onBack={() => goTo('home')} />
            <Field id="create-name" label="Your name">
              <input
                id="create-name"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Sam"
                maxLength={NAME_MAX_LENGTH}
                autoFocus
                autoComplete="nickname"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                className={INPUT_CLASS}
              />
            </Field>
            {error && <FormError>{error}</FormError>}
            <SubmitButton disabled={!canCreate} loading={loading} loadingText="Creating room…">
              Create room
            </SubmitButton>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} noValidate aria-busy={loading} className="home-panel rounded-3xl p-5 animate-slide-up">
            <PanelHeader title="Join a room" subtitle="Ask the host for the code on their screen." onBack={() => goTo('home')} />
            <div className="space-y-4">
              <Field id="join-code" label="Room code">
                <input
                  id="join-code"
                  type="text"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter with a complete code but no name yet → move on instead of doing nothing
                    if (e.key === 'Enter' && code.length === CODE_LENGTH && !trimmedName) {
                      e.preventDefault();
                      joinNameRef.current?.focus();
                    }
                  }}
                  placeholder="ABCD"
                  maxLength={CODE_LENGTH}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  className={`${INPUT_CLASS} input-code h-16 text-center font-mono font-bold uppercase tracking-[0.5em] pl-[calc(1rem_+_0.5em)]`}
                />
              </Field>
              <Field id="join-name" label="Your name">
                <input
                  ref={joinNameRef}
                  id="join-name"
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Sam"
                  maxLength={NAME_MAX_LENGTH}
                  autoComplete="nickname"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
            {error && <FormError>{error}</FormError>}
            <SubmitButton disabled={!canJoin} loading={loading} loadingText="Joining…">
              Join room
            </SubmitButton>
          </form>
        )}
      </div>

      {mode === 'home' && <HowItWorks />}

      {/* Game Showcase */}
      <div className="relative z-10 w-full max-w-sm mt-10 pt-8 border-t border-(--border)">
        <GameShowcase />
      </div>
    </main>
  );
}

/* ============================================
   Sub-components
   ============================================ */

/** Decorative fan of game cards — a hand of games dealt on the table. */
function HeroFan() {
  const games = GAME_REGISTRY.slice(0, 7);
  const mid = (games.length - 1) / 2;
  const overlap = games.length > 5 ? 12 : 6;

  return (
    <div className="hero-fan" aria-hidden="true">
      {games.map((game, i) => {
        const offset = i - mid;
        const style = {
          '--card-accent': game.accentHex,
          '--rot': `${offset * 8}deg`,
          '--lift': `${offset * offset * 3}px`,
          '--overlap': `${overlap}px`,
          '--deal-delay': `${120 + i * 70}ms`,
          '--float-delay': `${900 + i * 350}ms`,
          zIndex: Math.round(10 - Math.abs(offset) * 2),
        } as CSSProperties;
        return (
          <span key={game.id} className="hero-card" style={style}>
            {game.icon}
          </span>
        );
      })}
    </div>
  );
}

function PanelHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className="flex items-start gap-1.5 mb-5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="-ml-2 -mt-1.5 w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-elevated) active:scale-95 transition-[transform,color,background-color]"
      >
        <ArrowLeftIcon size={20} />
      </button>
      <div>
        <h2 className="text-xl font-bold leading-tight">{title}</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block mb-1.5 ml-1 text-xs font-medium text-(--text-secondary)">
        {label}
      </label>
      {children}
    </div>
  );
}

function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 text-sm text-(--danger)" role="alert">
      <AlertCircleIcon size={16} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

function SubmitButton({ disabled, loading, loadingText, children }: {
  disabled: boolean;
  loading: boolean;
  loadingText: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className={`mt-5 w-full h-14 rounded-2xl bg-(--brand) text-(--bg-primary) font-heading text-base font-semibold flex items-center justify-center gap-2 transition-[transform,opacity,filter] ${
        loading
          ? 'cta-glow'
          : disabled
            ? 'opacity-40'
            : 'cta-glow active:scale-[0.98] hover:brightness-110'
      }`}
    >
      {loading && <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />}
      {loading ? loadingText : children}
    </button>
  );
}

const STEPS = [
  { title: 'Create', detail: 'a room' },
  { title: 'Share', detail: 'the code' },
  { title: 'Play', detail: 'together' },
];

function HowItWorks() {
  return (
    <ol className="relative z-10 w-full max-w-sm mt-8 grid grid-cols-3 gap-2 animate-fade-in" aria-label="How it works">
      {STEPS.map((step, i) => (
        <li key={step.title} className="relative flex flex-col items-center text-center">
          {i < STEPS.length - 1 && (
            <span
              className="absolute top-4 left-[calc(50%_+_22px)] right-[calc(-50%_+_14px)] h-px bg-(--border-light)"
              aria-hidden="true"
            />
          )}
          <span className="w-8 h-8 rounded-full bg-(--bg-elevated) border border-(--border-light) flex items-center justify-center font-heading text-sm font-bold text-(--brand)">
            {i + 1}
          </span>
          <span className="mt-2 text-[13px] font-semibold text-(--text-primary)">{step.title}</span>
          <span className="text-xs text-(--text-muted)">{step.detail}</span>
        </li>
      ))}
    </ol>
  );
}
