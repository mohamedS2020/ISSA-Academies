'use client';

/**
 * ISSA — Auth Context Provider
 *
 * Client-side authentication state management.
 *
 * Provides:
 *   - login(phone, password, rememberMe) → authenticates and stores tokens
 *   - logout() → clears tokens and redirects to login
 *   - user object (id, name, role, tenantId, branchId, etc.)
 *   - isAuthenticated, isLoading states
 *   - Automatic token refresh 5 minutes before expiry
 *
 * Token storage:
 *   - rememberMe=true  → localStorage (persists across browser sessions)
 *   - rememberMe=false → sessionStorage (cleared when tab closes)
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { resolveSport, type SportKey } from '@/lib/theme/sports';

// ─── Types ──────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  tenantId?: string;
  branchId?: string;
  branchName?: string;
  tenantName?: string;
  /** The academy's sport branding theme (visual only). See src/lib/theme/sports.ts. */
  themeKey?: SportKey;
  language?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (
    phoneNumber: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<AuthUser>;
  logout: () => void;
  getAccessToken: () => string | null;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
  setSelectedBranch: (branchId: string, branchName: string) => void;
  /** Admin only: re-issue tokens scoped to another branch and update auth state. */
  switchBranch: (branchId: string) => Promise<void>;
}

// ─── Constants ──────────────────────────────────────────────

const STORAGE_KEY_ACCESS = 'issa_access_token';
const STORAGE_KEY_REFRESH = 'issa_refresh_token';
const STORAGE_KEY_USER = 'issa_user';
const STORAGE_KEY_REMEMBER = 'issa_remember';

/** Refresh the access token 5 minutes before it expires */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ─── Context ────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Storage Helpers ────────────────────────────────────────

function getStorage(): Storage {
  if (typeof window === 'undefined') {
    // SSR — return a no-op storage
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
  }
  const isRemembered = localStorage.getItem(STORAGE_KEY_REMEMBER) === 'true';
  return isRemembered ? localStorage : sessionStorage;
}

function storeTokens(
  accessToken: string,
  refreshToken: string,
  user: AuthUser,
  rememberMe: boolean
): void {
  const storage = rememberMe ? localStorage : sessionStorage;

  // Store the remember flag in localStorage so we can find it on reload
  localStorage.setItem(STORAGE_KEY_REMEMBER, String(rememberMe));

  storage.setItem(STORAGE_KEY_ACCESS, accessToken);
  storage.setItem(STORAGE_KEY_REFRESH, refreshToken);
  storage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
}

function clearTokens(): void {
  // Clear from both storages to be safe
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(STORAGE_KEY_ACCESS);
    storage.removeItem(STORAGE_KEY_REFRESH);
    storage.removeItem(STORAGE_KEY_USER);
  }
  localStorage.removeItem(STORAGE_KEY_REMEMBER);
}

function loadStoredAuth(): {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
} {
  const storage = getStorage();
  const accessToken = storage.getItem(STORAGE_KEY_ACCESS);
  const refreshToken = storage.getItem(STORAGE_KEY_REFRESH);
  const userJson = storage.getItem(STORAGE_KEY_USER);

  let user: AuthUser | null = null;
  if (userJson) {
    try {
      user = JSON.parse(userJson);
    } catch {
      user = null;
    }
  }

  return { accessToken, refreshToken, user };
}

// ─── JWT Decode (client-side, no verification) ──────────────

function decodeJwtExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp ? payload.exp * 1000 : null; // Convert to ms
  } catch {
    return null;
  }
}

// ─── Provider Component ─────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);
  const scheduleRef = useRef<(accessToken: string) => void>(() => {});

  // ─── Token Refresh ──────────────────────────────────────

  const scheduleTokenRefresh = useCallback((accessToken: string) => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    const expiresAt = decodeJwtExpiry(accessToken);
    if (!expiresAt) return;

    const now = Date.now();
    const refreshAt = expiresAt - REFRESH_BUFFER_MS;
    const delay = Math.max(refreshAt - now, 0);

    refreshTimerRef.current = setTimeout(async () => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;

      try {
        const storage = getStorage();
        const refreshToken = storage.getItem(STORAGE_KEY_REFRESH);
        if (!refreshToken) {
          // No refresh token — force logout
          clearTokens();
          setState({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return;
        }

        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
          // Refresh failed — force logout
          clearTokens();
          setState({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return;
        }

        const data = await res.json();
        const newAccessToken = data.data.accessToken;

        // Update storage
        storage.setItem(STORAGE_KEY_ACCESS, newAccessToken);

        setState((prev) => ({
          ...prev,
          accessToken: newAccessToken,
        }));

        // Schedule next refresh
        scheduleRef.current(newAccessToken);
      } catch {
        // Network error — will retry on next page interaction
      } finally {
        isRefreshingRef.current = false;
      }
    }, delay);
  }, []);

  // ─── Initialize from Storage ────────────────────────────

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/immutability */
  useEffect(() => {
    scheduleRef.current = scheduleTokenRefresh;
    const { accessToken, user } = loadStoredAuth();

    if (accessToken && user) {
      // Check if token is expired
      const expiresAt = decodeJwtExpiry(accessToken);
      if (expiresAt && expiresAt > Date.now()) {
        setState({
          user,
          accessToken,
          isAuthenticated: true,
          isLoading: false,
        });
        scheduleTokenRefresh(accessToken);
      } else {
        // Token expired — try to refresh
        const storage = getStorage();
        const refreshToken = storage.getItem(STORAGE_KEY_REFRESH);
        if (refreshToken) {
          // Attempt refresh
          fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          })
            .then((res) => {
              if (!res.ok) throw new Error('Refresh failed');
              return res.json();
            })
            .then((data) => {
              const newAccessToken = data.data.accessToken;
              storage.setItem(STORAGE_KEY_ACCESS, newAccessToken);
              setState({
                user,
                accessToken: newAccessToken,
                isAuthenticated: true,
                isLoading: false,
              });
              scheduleTokenRefresh(newAccessToken);
            })
            .catch(() => {
              clearTokens();
              setState({
                user: null,
                accessToken: null,
                isAuthenticated: false,
                isLoading: false,
              });
            });
        } else {
          clearTokens();
          setState({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      }
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }

    // Cleanup timer on unmount
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scheduleTokenRefresh]);

  // ─── Login ──────────────────────────────────────────────

  // ─── Sport theme sync ───────────────────────────────────
  // Keeps `data-sport` on <html> in sync on login/logout — a SEPARATE axis from
  // light/dark (.dark, owned by ThemeProvider) that composes with it. The
  // pre-hydration script in [locale]/layout.tsx sets it before first paint (no
  // flash); this effect reacts to auth changes.
  // Priority: logged-in academy > the subdomain's academy (data-host-sport,
  // server-rendered) > swimming (base palette).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const hostSport = el.getAttribute('data-host-sport');
    el.dataset.sport = resolveSport(state.user?.themeKey ?? hostSport);
  }, [state.user?.themeKey]);

  const login = useCallback(
    async (
      phoneNumber: string,
      password: string,
      rememberMe = false
    ): Promise<AuthUser> => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, password, rememberMe }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error?.message ?? 'Login failed'
        );
      }

      const { accessToken, refreshToken, user } = data.data;

      storeTokens(accessToken, refreshToken, user, rememberMe);

      setState({
        user,
        accessToken,
        isAuthenticated: true,
        isLoading: false,
      });

      scheduleTokenRefresh(accessToken);

      // Return the authenticated user so callers can redirect based on role
      // without re-reading storage (which is racy right after login).
      return user as AuthUser;
    },
    [scheduleTokenRefresh]
  );

  // ─── Logout ─────────────────────────────────────────────

  const logout = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    clearTokens();

    setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  // ─── Get Token ──────────────────────────────────────────

  const getAccessToken = useCallback((): string | null => {
    return state.accessToken;
  }, [state.accessToken]);

  // ─── Authenticated Fetch ────────────────────────────────
  // Wrapper around fetch that attaches the Bearer token. Reads the token from
  // storage at call time (not from closure) so it always uses the freshest
  // token, even right after login or a refresh.
  const authFetch = useCallback(
    (input: string, init: RequestInit = {}): Promise<Response> => {
      const token =
        state.accessToken ?? getStorage().getItem(STORAGE_KEY_ACCESS);

      const headers = new Headers(init.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      return fetch(input, { ...init, headers });
    },
    [state.accessToken]
  );

  // ─── Set Selected Branch ────────────────────────────────
  const setSelectedBranch = useCallback((branchId: string, branchName: string) => {
    setState((prev) => {
      if (!prev.user) return prev;
      const updatedUser = { ...prev.user, branchId, branchName };
      const storage = getStorage();
      storage.setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser));
      return { ...prev, user: updatedUser };
    });
  }, []);

  // ─── Switch Branch (admin) ──────────────────────────────
  // Asks the server for a fresh token pair scoped to `branchId`, then swaps
  // both tokens + the cached user so every subsequent request is branch-scoped.
  const switchBranch = useCallback(
    async (branchId: string) => {
      const token = state.accessToken ?? getStorage().getItem(STORAGE_KEY_ACCESS);
      const rememberMe =
        typeof window !== 'undefined' &&
        localStorage.getItem(STORAGE_KEY_REMEMBER) === 'true';

      const res = await fetch('/api/auth/switch-branch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ branchId, rememberMe }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Failed to switch branch');
      }

      const {
        accessToken,
        refreshToken,
        branchId: newBranchId,
        branchName,
      } = data.data;

      if (!state.user) throw new Error('Not authenticated');
      const updatedUser = { ...state.user, branchId: newBranchId, branchName };

      storeTokens(accessToken, refreshToken, updatedUser, rememberMe);
      setState((prev) => ({ ...prev, accessToken, user: updatedUser }));
      scheduleTokenRefresh(accessToken);
    },
    [state.accessToken, state.user, scheduleTokenRefresh]
  );

  // ─── Render ─────────────────────────────────────────────

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    getAccessToken,
    authFetch,
    setSelectedBranch,
    switchBranch,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────

/**
 * Access the auth context from any client component.
 *
 * @example
 * const { user, login, logout, isAuthenticated } = useAuth();
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
