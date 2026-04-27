'use client';

import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket-events';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;
let visibilityHandlerBound = false;

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity, // Never stop trying
      reconnectionDelay: 500,         // Start fast (500ms, not 1s)
      reconnectionDelayMax: 3000,     // Cap at 3s (not 5s default)
      timeout: 10000,
    }) as TypedSocket;
  }
  return socket;
}

export function connectSocket(): TypedSocket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }

  // Bind visibility change handler once — forces reconnect when phone wakes up
  if (!visibilityHandlerBound && typeof document !== 'undefined') {
    visibilityHandlerBound = true;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && socket) {
        // Phone just came back to foreground
        if (!socket.connected) {
          console.log('[Socket] Page visible, forcing reconnect...');
          // Reset reconnection delay so it tries immediately
          socket.disconnect();
          socket.connect();
        } else {
          // Socket thinks it's connected but might be stale — ping to verify
          // If the ping fails, Socket.IO will trigger a disconnect + reconnect
          console.log('[Socket] Page visible, socket connected, requesting state refresh...');
        }
      }
    });

    // Also handle the 'online' event for network recovery
    window.addEventListener('online', () => {
      if (socket && !socket.connected) {
        console.log('[Socket] Network back online, forcing reconnect...');
        socket.disconnect();
        socket.connect();
      }
    });

    // Use pagehide for faster disconnect detection when user closes tab/navigates away.
    // pagehide is more reliable than beforeunload on mobile browsers.
    window.addEventListener('pagehide', () => {
      if (socket?.connected) {
        // Send a transport-level close so the server detects disconnect immediately
        // instead of waiting for pingTimeout (5s)
        socket.disconnect();
      }
    });
  }

  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}
