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
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <div className="text-sm text-muted-foreground mt-1 font-mono">
          {billing ? `Plan: ${billing.plan} (${billing.plan_source})` : "Loading…"}
        </div>
        {success ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Payment successful. Your subscription will be activated shortly.
          </div>
        ) : null}
      </div>

      <div className="border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Subscription status</div>
            <div className="font-mono">{billing?.subscription_status ?? "free"}</div>
          </div>
          {billing?.plan === "free" ? (
            <div className="flex gap-2">
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-sm font-mono"
                value={upgradePlan}
                onChange={(e) => setUpgradePlan(e.target.value as "pro" | "enterprise")}
              >
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <Button onClick={() => void onUpgrade()}>Upgrade</Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => void onCancel()}>
              Cancel subscription
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Usage (monthly tokens)</div>
            <div className="font-mono">
              {billing?.usage.monthly_token_limit == null
                ? "Unlimited"
                : `${billing?.usage.tokens_used.toLocaleString()} / ${billing?.usage.monthly_token_limit.toLocaleString()}`
              }
            </div>
          </div>
          {meter && meter.limit ? (
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${meter.pct}%` }} />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Documents</div>
            <div className="font-mono text-sm">
              {billing?.limits.documents.max == null
                ? "Unlimited"
                : `${billing?.limits.documents.used} / ${billing?.limits.documents.max}`}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Corpora</div>
            <div className="font-mono text-sm">
              {billing?.limits.corpora.max == null
                ? "Unlimited"
                : `${billing?.limits.corpora.used} / ${billing?.limits.corpora.max}`}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Members</div>
            <div className="font-mono text-sm">
              {billing?.limits.members.max == null
                ? "Unlimited"
                : `${billing?.limits.members.used} / ${billing?.limits.members.max}`}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground font-mono">
          Period end: {billing?.period.current_period_end ?? "—"}
        </div>
      </div>

      <div className="border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Payment history</div>
            <div className="text-xs text-muted-foreground">Last 50 webhook events</div>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {loading ? "Loading…" : `${history.length} events`}
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground font-mono border-b border-border">
                <th className="py-2">Event</th>
                <th className="py-2">Reference</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-sm text-muted-foreground">
                    No history yet.
                  </td>
                </tr>
              ) : (
                history.map((r) => (
                  <tr key={r.id} className="border-b border-border/30">
                    <td className="py-2 font-mono">{r.paystack_event}</td>
                    <td className="py-2 font-mono text-xs">{r.paystack_reference}</td>
                    <td className="py-2">
                      <span className="font-mono text-xs">
                        {r.processed ? "processed" : "pending"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

