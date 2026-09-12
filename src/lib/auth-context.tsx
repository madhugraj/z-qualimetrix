import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";

// role is free-text ('pm' | 'po' | 'executive' | 'developer' | 'tester' |
// 'unassigned' in practice, not a fixed union) — matches the backend contract
// in src/api/middleware/auth.middleware.ts.
export interface AuthUser {
  id: string;
  tenantId: string | null;
  role: string;
  email: string;
  name: string | null;
  isActive: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  refetch: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      // apiFetch (not raw fetch) so an expired 15-minute access token gets
      // silently refreshed-and-retried here too — otherwise a routine TTL
      // expiry reads as "user has no role/account" instead of what it
      // actually is, a session that just needs its cookie refreshed.
      const res = await apiFetch("/auth/me");
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <AuthContext.Provider value={{ user, isLoading, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
