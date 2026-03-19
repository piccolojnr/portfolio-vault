"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAdminAccessToken } from "@/lib/platform-admin";

export default function PlatformAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRetryAfter(null);
    setLoading(true);

    try {
      const res = await fetch("/api/platform/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) {
          const after = res.headers.get("Retry-After");
          setRetryAfter(after ? parseInt(after, 10) : 60);
          setError(
            data.detail || "Too many attempts. Please try again later."
          );
        } else {
          setError(data.detail || "Login failed");
        }
        setLoading(false);
        return;
      }

      const { access_token, must_change_password } = data;
      setAdminAccessToken(access_token);

      document.cookie = `admin_access_token=${access_token}; path=/; max-age=${60 * 15}; SameSite=Lax`;

      if (must_change_password) {
        router.push("/change-password");
      } else {
        router.push("/");
      }
    } catch {
      setError("Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4">
      <div className="w-full max-w-sm rounded border border-neutral-800 bg-[#141414] p-6">
        <h1 className="mb-6 text-lg font-medium text-neutral-200">
          Platform Admin Login
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs text-neutral-500"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded border border-neutral-700 bg-[#0f0f0f] px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs text-neutral-500"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded border border-neutral-700 bg-[#0f0f0f] px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-neutral-600 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">
              {error}
              {retryAfter != null && (
                <span className="ml-1 text-neutral-500">
                  Retry after {retryAfter} seconds.
                </span>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
