"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { setAccessToken } from "@/lib/auth";
import { getMe, updateMe, type MeResponse } from "@/lib/auth";
import Link from "next/link";

// ── Sub-components (identical to settings page) ────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
      {children}
    </h2>
  );
}

function FieldRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2.5">
      <label className="w-40 shrink-0 text-[12px] font-mono text-muted-foreground">
        {label}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
      {hint && (
        <p className="text-[10px] text-muted-foreground/50 font-mono sm:w-32 sm:text-right shrink-0">
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, org, refresh: refreshAuth } = useAuth();
  const canManage = org?.role === "admin" || org?.role === "owner";

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then((data) => {
        setMe(data);
        setDisplayName(data.user.display_name ?? "");
        setUseCase(data.user.use_case ?? "");
      })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "Failed to load profile"));
  }, []);

  const saveProfile = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await updateMe({ display_name: displayName, use_case: useCase });
      if (result.access_token) {
        setAccessToken(result.access_token);
        await refreshAuth();
      }
      setSaveMsg({ text: "Saved", ok: true });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setSaveMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
    } finally {
      setSaving(false);
    }
  }, [displayName, useCase, refreshAuth]);

  async function handlePasswordReset() {
    if (!user?.email) return;
    setResetLoading(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      setResetMsg(res.ok ? "Reset link sent — check your inbox" : "Failed to send reset email");
    } catch {
      setResetMsg("Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  }

  if (loadErr) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[13px] text-destructive font-mono">{loadErr}</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/20" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const memberSince = me.user.created_at
    ? new Date(me.user.created_at).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-8">

          {/* Header */}
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Profile
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Your account details and personal preferences.
            </p>
          </div>

          {/* Account */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>Account</SectionHeading>
            <div className="divide-y divide-border/30">
              <FieldRow label="email">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono text-foreground">
                    {me.user.email}
                  </span>
                  {me.user.email_verified && (
                    <span className="text-[10px] font-mono text-green-400 border border-green-400/30 rounded px-1.5 py-0.5">
                      verified
                    </span>
                  )}
                </div>
              </FieldRow>
              <FieldRow label="member since" hint="UTC">
                <span className="text-[12px] font-mono text-foreground">
                  {memberSince}
                </span>
              </FieldRow>
            </div>
          </section>

          {/* Profile */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>Profile</SectionHeading>
            <div className="divide-y divide-border/30">
              <FieldRow label="display name">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </FieldRow>
              <FieldRow label="use case" hint="shown during onboarding">
                <input
                  type="text"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  placeholder="How you use this workspace"
                  className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </FieldRow>
            </div>
          </section>

          {/* Organisation */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>Organisation</SectionHeading>
            <div className="divide-y divide-border/30">
              <FieldRow label="name">
                <span className="text-[12px] font-mono text-foreground">
                  {me.org.name}
                </span>
              </FieldRow>
              <FieldRow label="role">
                <span className="text-[12px] font-mono text-foreground">
                  {me.org.role}
                </span>
              </FieldRow>
              <FieldRow label="plan">
                <span className="text-[12px] font-mono text-foreground">
                  {me.org.plan}
                </span>
              </FieldRow>
            </div>
            {canManage && (
              <div className="mt-3">
                <Link
                  href="/settings/organisation"
                  className="text-[11px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-2"
                >
                  manage organisation →
                </Link>
              </div>
            )}
          </section>

          {/* Password */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>Password</SectionHeading>
            <p className="text-[11px] font-mono text-muted-foreground/60 mb-3">
              Send a reset link to your email address to change your password.
            </p>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={handlePasswordReset}
                disabled={resetLoading}
                className="h-7 px-3 text-[11px] font-mono"
              >
                {resetLoading ? "sending…" : "send reset email"}
              </Button>
              {resetMsg && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  {resetMsg}
                </span>
              )}
            </div>
          </section>

          {/* Save */}
          <div className="flex items-center gap-3 pb-4">
            <Button
              onClick={saveProfile}
              disabled={saving}
              className="h-8 px-4 font-mono text-[12px]"
            >
              {saving ? "saving…" : "save profile"}
            </Button>
            {saveMsg && (
              <span
                className={`text-[12px] font-mono ${saveMsg.ok ? "text-green-400" : "text-destructive"}`}
              >
                {saveMsg.text}
              </span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
