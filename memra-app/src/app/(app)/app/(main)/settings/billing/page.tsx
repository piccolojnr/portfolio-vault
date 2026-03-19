"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/network/api";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

type BillingResponse = {
  plan: string;
  plan_source: string;
  subscription_status: string | null;
  period: {
    current_period_start: string | null;
    current_period_end: string | null;
  };
  usage: {
    tokens_used: number;
    monthly_token_limit: number | null;
  };
  limits: {
    documents: { used: number; max: number | null };
    corpora: { used: number; max: number | null };
    members: { used: number; max: number | null };
  };
  next_billing_date: string | null;
};

type HistoryRow = {
  id: string;
  paystack_event: string;
  paystack_reference: string;
  processed: boolean;
  error: string | null;
  created_at: string | null;
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
      {children}
    </h2>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
      <div className="text-lg font-mono font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { org, refresh } = useAuth();

  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradePlan, setUpgradePlan] = useState<"pro" | "enterprise">("pro");

  const success = searchParams.get("payment") === "success";

  const meter = useMemo(() => {
    if (!billing) return null;
    const limit = billing.usage.monthly_token_limit;
    const used = billing.usage.tokens_used;
    if (!limit) return { pct: 0, used, limit: null as number | null };
    const pct = Math.min(100, (used / limit) * 100);
    return { pct, used, limit };
  }, [billing]);

  useEffect(() => {
    if (!org?.id) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [b, h] = await Promise.all([
          apiFetch<BillingResponse>("/api/billing"),
          apiFetch<HistoryRow[]>("/api/billing/history"),
        ]);
        if (!cancelled) {
          setBilling(b);
          setHistory(h);
        }
      } catch {
        if (!cancelled) {
          setBilling(null);
          setHistory([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    // If the modal already opened because of a 402, refresh auth/org state.
    if (success) void refresh();

    return () => {
      cancelled = true;
    };
  }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onUpgrade() {
    const plan = upgradePlan;
    const res = await apiFetch<{ authorization_url: string }>(
      "/api/billing/subscribe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      },
    );

    // Paystack redirect
    window.location.href = res.authorization_url;
  }

  async function onCancel() {
    const ok = window.confirm(
      "Cancel your subscription? You will keep access until the end of the current billing period."
    );
    if (!ok) return;
    await apiFetch("/api/billing/cancel", { method: "POST" });
    await refresh();
    await new Promise((r) => setTimeout(r, 750));
    router.refresh();
  }

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Billing</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Manage your plan, billing status, and payment history.
            </p>
            {success ? (
              <p className="mt-2 text-[11px] font-mono text-emerald-400">
                Payment successful. Your subscription will be activated shortly.
              </p>
            ) : null}
          </div>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/20" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard label="Current Plan" value={billing?.plan ?? "free"} />
                <StatCard label="Subscription" value={billing?.subscription_status ?? "free"} />
                <StatCard
                  label="Current Period End"
                  value={formatDate(billing?.period.current_period_end ?? null)}
                />
              </div>

              <section className="rounded-xl border border-border bg-surface/40 p-5">
                <SectionHeading>Subscription</SectionHeading>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-[12px] font-mono text-muted-foreground">
                    Plan source: <span className="text-foreground">{billing?.plan_source ?? "—"}</span>
                  </div>
                  {billing?.plan === "free" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="h-8 rounded-md border border-border bg-surface px-2 text-[12px] font-mono"
                        value={upgradePlan}
                        onChange={(e) => setUpgradePlan(e.target.value as "pro" | "enterprise")}
                      >
                        <option value="pro">pro</option>
                        <option value="enterprise">enterprise</option>
                      </select>
                      <Button onClick={() => void onUpgrade()} className="h-8 px-3 text-[11px] font-mono">
                        upgrade
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={() => void onCancel()} className="h-8 px-3 text-[11px] font-mono">
                      cancel subscription
                    </Button>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface/40 p-5">
                <SectionHeading>Usage & Limits</SectionHeading>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[12px] font-mono">
                    <span className="text-muted-foreground">monthly tokens</span>
                    <span className="text-foreground">
                      {billing?.usage.monthly_token_limit == null
                        ? "unlimited"
                        : `${billing?.usage.tokens_used.toLocaleString()} / ${billing?.usage.monthly_token_limit.toLocaleString()}`}
                    </span>
                  </div>
                  {meter && meter.limit ? (
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${meter.pct}%` }} />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="rounded-lg border border-border/40 p-3">
                      <div className="text-[10px] font-mono text-muted-foreground">documents</div>
                      <div className="text-[12px] font-mono text-foreground mt-1">
                        {billing?.limits.documents.max == null
                          ? "unlimited"
                          : `${billing?.limits.documents.used} / ${billing?.limits.documents.max}`}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/40 p-3">
                      <div className="text-[10px] font-mono text-muted-foreground">corpora</div>
                      <div className="text-[12px] font-mono text-foreground mt-1">
                        {billing?.limits.corpora.max == null
                          ? "unlimited"
                          : `${billing?.limits.corpora.used} / ${billing?.limits.corpora.max}`}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/40 p-3">
                      <div className="text-[10px] font-mono text-muted-foreground">members</div>
                      <div className="text-[12px] font-mono text-foreground mt-1">
                        {billing?.limits.members.max == null
                          ? "unlimited"
                          : `${billing?.limits.members.used} / ${billing?.limits.members.max}`}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface/40 p-5">
                <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
                  <h2 className="text-[13px] font-semibold text-foreground font-mono">Payment history</h2>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {history.length} events
                  </span>
                </div>

                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-muted/10 border-b border-border/40">
                      <tr>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Event
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Reference
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-[12px] font-mono text-muted-foreground">
                            No history yet.
                          </td>
                        </tr>
                      ) : (
                        history.map((r) => (
                          <tr key={r.id} className="border-t border-border/20">
                            <td className="px-3 py-2.5 font-mono text-[12px]">{r.paystack_event}</td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                              {r.paystack_reference}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                  r.processed
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-amber-500/20 text-amber-400"
                                }`}
                              >
                                {r.processed ? "processed" : "pending"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

