import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  login as serverLogin,
  loginWithPassword as serverPasswordLogin,
  loginWithSso as serverSsoLogin,
  setAuthToken,
  type LoginResult,
} from "../lib/api";
import { DEMO_USERS, type Role, type SessionUser } from "../types/auth";

interface AuthCtx {
  user: SessionUser | null;
  /** Sign in for a role — fetches a server JWT (falls back to a local session). */
  login: (role: Role) => Promise<SessionUser>;
  /** Sign in with username + password (server-verified; throws on failure). */
  loginWithPassword: (username: string, password: string) => Promise<SessionUser>;
  /** Sign in via the SSO stub (server-issued; throws on failure). */
  loginWithSso: (email: string) => Promise<SessionUser>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

const STORAGE_KEY = "stm.auth";

function initialUser(): SessionUser | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (parsed && parsed.role && DEMO_USERS[parsed.role]) {
      // Re-arm the API client with the stored token after a refresh.
      if (parsed.token) setAuthToken(parsed.token);
      return parsed;
    }
  } catch {
    /* ignore malformed session */
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);

  const finalize = useCallback((session: SessionUser): SessionUser => {
    setUser(session);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
    return session;
  }, []);

  const sessionFrom = (res: LoginResult): SessionUser => {
    setAuthToken(res.token);
    return {
      id: res.user.sub,
      name: res.user.name,
      role: res.user.role,
      since: new Date().toISOString(),
      token: res.token,
    };
  };

  const login = useCallback(
    async (role: Role): Promise<SessionUser> => {
      try {
        return finalize(sessionFrom(await serverLogin(role)));
      } catch {
        // Gateway unreachable — keep a local session so read-only screens work;
        // write actions will be rejected (401) until the gateway is back.
        setAuthToken(null);
        return finalize({ ...DEMO_USERS[role], since: new Date().toISOString() });
      }
    },
    [finalize],
  );

  const loginWithPassword = useCallback(
    async (username: string, password: string): Promise<SessionUser> =>
      finalize(sessionFrom(await serverPasswordLogin(username, password))),
    [finalize],
  );

  const loginWithSso = useCallback(
    async (email: string): Promise<SessionUser> =>
      finalize(sessionFrom(await serverSsoLogin(email))),
    [finalize],
  );

  const logout = useCallback(() => {
    setUser(null);
    setAuthToken(null);
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({ user, login, loginWithPassword, loginWithSso, logout }),
    [user, login, loginWithPassword, loginWithSso, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
