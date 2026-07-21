'use client';

/**
 * ISSA — Auth Context Provider
 *
 * Client-side authentication state.
 *
 * Tokens live in **httpOnly cookies** (set by the auth API routes), NOT in
 * localStorage — so JavaScript can't read them and they can't be stolen by XSS
 * or seen in DevTools → Storage. This provider therefore only keeps the
 * non-sensitive `user` display object in storage (for instant UI on reload) and
 * drives silent token refresh via a timer + a 401→refresh→retry in authFetch.
 * See src/lib/auth/cookies.ts.
 *
 * Storage:
 *   - rememberMe=true  → localStorage (user object persists across sessions)
 *   - rememberMe=false → sessionStorage (cleared when the tab closes)
 */

import {
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
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
  setSelectedBranch: (branchId: string, branchName: string) => void;
  /** Admin only: re-issue tokens scoped to another branch and update auth state. */
  switchBranch: (branchId: string) => Promise<void>;
}

// ─── Constants ──────────────────────────────────────────────

const STORAGE_KEY_USER = 'issa_user';
const STORAGE_KEY_REMEMBER = 'issa_remember';

/** Refresh the access token this many ms before it expires. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

type RefreshResult = 'ok' | 'unauthorized' | 'error';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Storage helpers (user display object only — NEVER tokens) ──

function getStorage(): Storage {
  const isRemembered = localStorage.getItem(STORAGE_KEY_REMEMBER) === 'true';
  return isRemembered ? localStorage : sessionStorage;
}

function storeUser(user: AuthUser, rememberMe: boolean): void {
  localStorage.setItem(STORAGE_KEY_REMEMBER, String(rememberMe));
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
}

function clearStoredUser(): void {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(STORAGE_KEY_USER);
  }
  localStorage.removeItem(STORAGE_KEY_REMEMBER);
}

function loadStoredUser(): AuthUser | null {
  const raw = getStorage().getItem(STORAGE_KEY_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

// ─── Provider Component ─────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);
  const doRefreshRef = useRef<() => Promise<RefreshResult>>(async () => 'error');

  const forceLoggedOut = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    clearStoredUser();
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }, []);

  const scheduleTokenRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(expiresInSeconds * 1000 - REFRESH_BUFFER_MS, 0);
    refreshTimerRef.current = setTimeout(() => {
      void doRefreshRef.current();
    }, delay);
  }, []);

  /**
   * Ask the server for a fresh access cookie using the httpOnly refresh cookie.
   *   'ok'           → refreshed + next refresh scheduled
   *   'unauthorized' → session invalid/revoked → forced logout
   *   'error'        → network hiccup → session left intact (retried later)
   */
  const doRefresh = useCallback(async (): Promise<RefreshResult> => {
    if (isRefreshingRef.current) return 'ok';
    isRefreshingRef.current = true;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (res.status === 401) {
        forceLoggedOut();
        return 'unauthorized';
      }
      if (!res.ok) return 'error';
      const data = await res.json();
      scheduleTokenRefresh(data?.data?.accessExpiresIn ?? 900);
      return 'ok';
    } catch {
      return 'error';
    } finally {
      isRefreshingRef.current = false;
    }
  }, [forceLoggedOut, scheduleTokenRefresh]);

  doRefreshRef.current = doRefresh;

  // ─── Bootstrap: validate the session on mount ───────────────
  // We can't read the httpOnly token, so we validate by refreshing (the refresh
  // cookie is sent automatically). 'unauthorized' → logged out; otherwise keep
  // the stored user (optimistic — a transient network error won't sign you out).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const user = loadStoredUser();
    if (!user) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await doRefresh();
      if (cancelled || result === 'unauthorized') return; // forceLoggedOut set state
      setState({ user, isAuthenticated: true, isLoading: false });
    })();
    return () => {
      cancelled = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [doRefresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ─── Sport theme sync ───────────────────────────────────
  // Keeps `data-sport` on <html> in sync on login/logout — a SEPARATE axis from
  // light/dark (.dark, owned by ThemeProvider) that composes with it. The
  // pre-hydration script in [locale]/layout.tsx sets it before first paint.
  // Priority: logged-in academy > subdomain academy (data-host-sport) > swimming.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const hostSport = el.getAttribute('data-host-sport');
    el.dataset.sport = resolveSport(state.user?.themeKey ?? hostSport);
  }, [state.user?.themeKey]);

  // ─── Login ──────────────────────────────────────────────
  const login = useCallback(
    async (
      phoneNumber: string,
      password: string,
      rememberMe = false
    ): Promise<AuthUser> => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ phoneNumber, password, rememberMe }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Login failed');
      }

      const { user, accessExpiresIn } = data.data as {
        user: AuthUser;
        accessExpiresIn: number;
      };

      storeUser(user, rememberMe);
      setState({ user, isAuthenticated: true, isLoading: false });
      scheduleTokenRefresh(accessExpiresIn ?? 900);

      // Return the authenticated user so callers can redirect by role without
      // re-reading storage (which is racy right after login).
      return user;
    },
    [scheduleTokenRefresh]
  );

  // ─── Logout ─────────────────────────────────────────────
  const logout = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    clearStoredUser();
    setState({ user: null, isAuthenticated: false, isLoading: false });
    // Clear the httpOnly cookies server-side (fire-and-forget).
    void fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => {});
  }, []);

  // ─── Authenticated Fetch (cookie-based, 401→refresh→retry once) ──
  const authFetch = useCallback(
    async (input: string, init: RequestInit = {}): Promise<Response> => {
      const opts: RequestInit = {
        ...init,
        credentials: init.credentials ?? 'same-origin',
      };
      const res = await fetch(input, opts);
      if (res.status !== 401) return res;

      // Access token likely expired — refresh once, then retry.
      const result = await doRefresh();
      if (result === 'ok') {
        return fetch(input, opts);
      }
      return res; // 'unauthorized' (logged out) or 'error' → return the 401
    },
    [doRefresh]
  );

  // ─── Set Selected Branch (UI display only) ──────────────
  const setSelectedBranch = useCallback(
    (branchId: string, branchName: string) => {
      setState((prev) => {
        if (!prev.user) return prev;
        const updatedUser = { ...prev.user, branchId, branchName };
        getStorage().setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser));
        return { ...prev, user: updatedUser };
      });
    },
    []
  );

  // ─── Switch Branch (admin) ──────────────────────────────
  // Asks the server for a fresh token pair (new cookies) scoped to `branchId`,
  // then updates the cached user + refresh timer.
  const switchBranch = useCallback(
    async (branchId: string) => {
      const rememberMe =
        typeof window !== 'undefined' &&
        localStorage.getItem(STORAGE_KEY_REMEMBER) === 'true';

      const res = await fetch('/api/auth/switch-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ branchId, rememberMe }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Failed to switch branch');
      }

      const { branchId: newBranchId, branchName, accessExpiresIn } = data.data;
      setState((prev) => {
        if (!prev.user) return prev;
        const updatedUser = { ...prev.user, branchId: newBranchId, branchName };
        getStorage().setItem(STORAGE_KEY_USER, JSON.stringify(updatedUser));
        return { ...prev, user: updatedUser };
      });
      scheduleTokenRefresh(accessExpiresIn ?? 900);
    },
    [scheduleTokenRefresh]
  );

  // ─── Render ─────────────────────────────────────────────

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
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
