"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Failed to send reset link");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Reset failed");
        return;
      }
      router.push("/login");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // Confirm mode (has token)
  if (token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <h1 className="text-xl font-mono font-semibold">set new password</h1>
          </div>
          <form onSubmit={handleConfirmReset} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">new password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="min 8 characters"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">confirm password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-mono hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "…" : "update password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Request mode (no token)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-mono font-semibold">reset password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        {sent ? (
          <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
            Check your email for a password reset link.
          </div>
        ) : (
          <form onSubmit={handleRequestReset} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="you@example.com"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-mono hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "…" : "send reset link"}
            </button>
          </form>
        )}

        <p className="text-xs font-mono text-center text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-sm font-mono text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
