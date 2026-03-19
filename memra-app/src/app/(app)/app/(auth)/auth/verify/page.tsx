"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Link from "next/link";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const pending = searchParams.get("pending");

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setMessage(data.detail ?? "Verification failed");
          return;
        }
        setStatus("success");
        router.push("/");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(String(err));
      });
  }, [token, router]);

  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-mono font-semibold">check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to your email address. Click it to activate your account.
          </p>
          <p className="text-xs text-muted-foreground">
            Didn&apos;t receive it? Check your spam folder or{" "}
            <Link href="/login" className="text-primary hover:underline">sign in again</Link>.
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return null;
  }

  if (status === "verifying") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm font-mono text-muted-foreground">Verifying…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-mono font-semibold text-destructive">verification failed</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Link href="/login" className="text-sm font-mono text-primary hover:underline">
            back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="text-sm font-mono text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
