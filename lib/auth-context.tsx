import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  clearSession,
  getCachedUser,
  getToken,
  setCachedUser,
  setToken,
  type SessionUser,
} from "@/lib/session";
import { trpc } from "@/lib/trpc";

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  signIn: (token: string, user: SessionUser) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const utils = trpc.useUtils();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      // Use cached user immediately, then verify with API.
      const cached = await getCachedUser();
      if (cached) setUser(cached);
      try {
        const fresh = await utils.client.auth.me.query();
        if (fresh) {
          setUser(fresh as SessionUser);
          await setCachedUser(fresh as SessionUser);
        } else {
          await clearSession();
          setUser(null);
        }
      } catch {
        // network issue — keep cached user
      }
    } finally {
      setLoading(false);
    }
  }, [utils]);

  const signIn = useCallback(async (token: string, sessionUser: SessionUser) => {
    await setToken(token);
    await setCachedUser(sessionUser);
    setUser(sessionUser);
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refresh }),
    [user, loading, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
