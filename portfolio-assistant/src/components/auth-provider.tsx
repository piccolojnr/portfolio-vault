"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { setAccessToken, clearTokens, refreshAccessToken } from "@/lib/auth";

interface UserInfo {
  id: string;
  email: string;
  email_verified: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
}

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
}

interface AuthContextValue {
  user: UserInfo | null;
  org: OrgInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  org: null,
  isLoading: true,
  isAuthenticated: false,
  refresh: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async (retried = false): Promise<void> => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.status === 401 && !retried) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          return fetchMe(true);
        }
        setUser(null);
        setOrg(null);
        return;
      }
      if (!res.ok) {
        setUser(null);
        setOrg(null);
        return;
      }
      const data = await res.json();
      if (data.access_token) {
        setAccessToken(data.access_token);
      }
      setUser(data.user ?? null);
      setOrg(data.org ?? null);
    } catch {
      setUser(null);
      setOrg(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchMe();
  }, [fetchMe]);

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
    setOrg(null);
    router.push("/login");
  }, [router]);

  useEffect(() => {
    fetchMe().finally(() => setIsLoading(false));
  }, [fetchMe]);

  return (
    <AuthContext.Provider
      value={{
        user,
        org,
        isLoading,
        isAuthenticated: !!user,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
