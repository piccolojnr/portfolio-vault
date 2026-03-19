"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { setAccessToken, clearTokens } from "@/lib/auth";
import { decodeJwtPayload } from "@/lib/auth";

interface UserInfo {
  id: string;
  email: string;
  display_name?: string | null;
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

function readAccessTokenCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function hydrateFromToken(
  token: string,
): { user: UserInfo; org: OrgInfo } | null {
  const p = decodeJwtPayload(token);
  if (!p || p.type !== "access") return null;
  return {
    user: {
      id: p.sub,
      email: p.email,
      display_name: p.display_name ?? null,
      email_verified: true,
      onboarding_completed_at: p.onboarding_completed_at ?? null,
      created_at: "",
    },
    org: {
      id: p.org_id,
      name: p.org_name,
      slug: "",
      plan: "",
      role: p.role,
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from the access_token cookie — no network call required.
  // Middleware ensures the cookie is always fresh before the page loads.
  useEffect(() => {
    const token = readAccessTokenCookie();
    if (token) {
      setAccessToken(token);
      const hydrated = hydrateFromToken(token);
      if (hydrated) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(hydrated.user);
        setOrg(hydrated.org);
      }
    }
    setIsLoading(false);
  }, []);

  // Explicit refresh — call after mutations that change user/org data
  // (e.g. updating org name, completing onboarding). Hits /api/auth/me for
  // an authoritative response including org slug, plan, and fresh state.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const data = await res.json();
      if (data.access_token) {
        setAccessToken(data.access_token);
      }
      setUser(data.user ?? null);
      setOrg(data.org ?? null);
    } catch {
      // best-effort
    }
  }, []);

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
    setOrg(null);
    router.push("/login");
  }, [router]);

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
