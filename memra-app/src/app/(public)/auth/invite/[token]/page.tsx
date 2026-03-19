"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import Link from "next/link";

interface InvitePreview {
  org_name: string;
  org_slug: string;
  invited_by_email: string | null;
  email: string;
  role: string;
  expires_at: string;
}

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const { isAuthenticated, refresh } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    params.then(({ token: t }) => {
      setToken(t);
      fetch(`/api/orgs/invites/${t}`)
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.detail ?? "Invite not found or expired");
            return;
          }
          setPreview(await res.json());
        })
        .catch((err) => setError(String(err)));
    });
  }, [params]);

  const handleAccept = async () => {
    if (!token) return;
    if (!isAuthenticated) {
      router.push(`/login?redirect=/auth/invite/${token}`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/invites/${token}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Failed to accept invite");
        return;
      }
      await refresh();
      router.push("/");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-mono font-semibold text-destructive">
            invite error
          </h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link
            href="/login"
            className="text-sm font-mono text-primary hover:underline"
          >
            sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm font-mono text-muted-foreground">
          Loading invitation…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-mono font-semibold">
            you&apos;re invited
          </h1>
          <p className="text-sm text-muted-foreground">
            {preview.invited_by_email
              ? `${preview.invited_by_email} invited you to join`
              : "You've been invited to join"}{" "}
            <strong>{preview.org_name}</strong> as a{" "}
            <strong>{preview.role}</strong>.
          </p>
        </div>

        <div className="rounded-md border border-border p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground font-mono text-xs">
              organisation
            </span>
            <span className="font-mono text-xs">{preview.org_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground font-mono text-xs">
              role
            </span>
            <span className="font-mono text-xs">{preview.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground font-mono text-xs">
              expires
            </span>
            <span className="font-mono text-xs">
              {new Date(preview.expires_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          onClick={handleAccept}
          disabled={loading}
          className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-mono hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading
            ? "…"
            : isAuthenticated
              ? "accept and join"
              : "sign in to accept"}
        </button>
      </div>
    </div>
  );
}
