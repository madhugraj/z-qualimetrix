import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { API_V1_URL } from "@/lib/api-config";

// role is free-text ('pm' | 'po' | 'executive' | 'developer' | 'tester' |
// 'unassigned' in practice, not a fixed union) — matches the backend contract
// in src/api/middleware/auth.middleware.ts.
export interface AuthUser {
  id: string;
  tenantId: string | null;
  role: string;
  email: string;
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
      const res = await fetch(`${API_V1_URL}/auth/me`, { credentials: "include" });
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
