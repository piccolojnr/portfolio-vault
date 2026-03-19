"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setAccessToken } from "@/lib/auth";
import { useAuth } from "@/components/providers/auth-provider";

function MagicLinkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const token = searchParams.get("token");
  const redirect = searchParams.get("redirect");

  const [status, setStatus] = useState<"verifying" | "error">("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }

    fetch("/api/auth/magic-link/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setMessage(data.detail ?? "Magic link verification failed");
          return;
        }
        const { access_token } = await res.json();
        setAccessToken(access_token);
        await refresh();
        router.push(redirect ?? "/");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(String(err));
      });
  }, [token, redirect, router, refresh]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-mono font-semibold text-destructive">sign in failed</h1>
          <p className="text-sm text-muted-foreground">Missing token in URL</p>
          <Link
            href="/login"
            className="text-sm font-mono text-primary hover:underline"
          >
            back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (status === "verifying") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm font-mono text-muted-foreground">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-mono font-semibold text-destructive">sign in failed</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
          <Link
            href="/login"
            className="text-sm font-mono text-primary hover:underline"
          >
            back to sign in
          </Link>
      </div>
    </div>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-sm font-mono text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <MagicLinkContent />
    </Suspense>
  );
}
