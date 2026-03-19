"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setAccessToken } from "@/lib/auth";
import { useAuth } from "@/components/providers/auth-provider";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();

  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Invalid credentials");
        return;
      }
      const { access_token } = await res.json();
      setAccessToken(access_token);
      await refresh();
      const redirect = searchParams.get("redirect") ?? "/";
      router.push(redirect);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const redirect = searchParams.get("redirect");
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...(redirect ? { redirect_url: redirect } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Failed to send magic link");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-mono font-semibold">sign in</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "password"
              ? "Enter your credentials"
              : "Get a magic link by email"}
          </p>
        </div>

        {sent ? (
          <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
            Check your email for a magic link. It expires in 15 minutes.
          </div>
        ) : (
          <form
            onSubmit={mode === "password" ? handleLogin : handleMagicLink}
            className="space-y-3"
          >
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">
                email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="you@example.com"
              />
            </div>

            {mode === "password" && (
              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-foreground">
                  password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-mono hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading
                ? "…"
                : mode === "password"
                  ? "sign in"
                  : "send magic link"}
            </button>
          </form>
        )}

        <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
          <button
            onClick={() => {
              setMode(mode === "password" ? "magic" : "password");
              setError("");
              setSent(false);
            }}
            className="hover:text-foreground transition-colors"
          >
            {mode === "password"
              ? "use magic link instead"
              : "use password instead"}
          </button>
          {mode === "password" && (
            <Link
              href="/auth/reset-password"
              className="hover:text-foreground transition-colors"
            >
              forgot password?
            </Link>
          )}
        </div>

        <p className="text-xs font-mono text-center text-muted-foreground">
          No account?{" "}
          <Link href="/register" className="text-primary hover:underline">
            create one
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-sm font-mono text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
