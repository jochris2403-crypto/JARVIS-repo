import { create } from 'zustand';
import { fetchSession, login, logout } from '@/api/auth';
import { setUnauthorizedHandler } from '@/api/client';
import { errorMessage } from '@/lib/errors';

export type AuthStatus = 'checking' | 'signed-in' | 'signed-out' | 'unreachable';

interface AuthState {
  status: AuthStatus;
  /** False when the server runs without a password (local use on 127.0.0.1). */
  authRequired: boolean;
  username: string | null;
  /** Why the session could not be checked, when `status` is `unreachable`. The shell
   *  is shown meanwhile, with its own offline state. */
  error: string | null;

  checkSession: () => Promise<void>;
  /** Resolves on success; rejects with the server's error (e.g. wrong password). */
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** The server rejected a request: the session expired or was revoked. */
  sessionExpired: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'checking',
  authRequired: false,
  username: null,
  error: null,

  checkSession: async () => {
    try {
      const session = await fetchSession();
      set({
        status: session.authenticated ? 'signed-in' : 'signed-out',
        authRequired: session.authRequired,
        username: session.username,
        error: null,
      });
    } catch (error) {
      set({ status: 'unreachable', error: errorMessage(error) });
    }
  },

  signIn: async (username, password) => {
    const session = await login({ username, password });
    set({
      status: 'signed-in',
      authRequired: session.authRequired,
      username: session.username,
      error: null,
    });
  },

  signOut: async () => {
    try {
      await logout();
    } finally {
      // A full reload drops every in-memory store (connections, schemas, results).
      window.location.assign('/');
    }
  },

  sessionExpired: () => {
    const { status } = get();
    if (status === 'signed-in' || status === 'unreachable') {
      set({ status: 'signed-out', authRequired: true, username: null });
    }
  },
}));

setUnauthorizedHandler(() => useAuthStore.getState().sessionExpired());
