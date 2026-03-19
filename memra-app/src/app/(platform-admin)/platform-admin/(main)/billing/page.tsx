"use client";

import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";

type BillingOverview = {
  active_subscription_count: number;
  attention_count: number;
};

export default function BillingDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-billing-overview"],
    queryFn: () => adminFetch<BillingOverview>(`/api/platform/billing/overview`),
  });

  const activeSubscriptions = data?.active_subscription_count ?? 0;
  const attentionCount = data?.attention_count ?? 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
        <div className="max-w-5xl mx-auto space-y-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Billing
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Subscription health and payment attention at a glance.
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-xl bg-surface/40"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
                <div className="text-lg font-mono font-semibold text-foreground">
                  {activeSubscriptions}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Active Subscriptions
                </div>
              </div>
              <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
                <div className="text-lg font-mono font-semibold text-foreground">
                  {attentionCount}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Failed Payments Requiring Attention
                </div>
              </div>
            </div>
          )}

          <section className="rounded-xl border border-border/60 bg-surface/40 p-5">
            <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
              Overview
            </h2>
            <div className="space-y-3 text-[12px] font-mono">
              <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2.5">
                <span className="text-muted-foreground">Subscriptions</span>
                <span className="text-foreground">
                  {isLoading ? "—" : `${activeSubscriptions} active`}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2.5">
                <span className="text-muted-foreground">Payment Attention Queue</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    attentionCount > 0
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-emerald-500/20 text-emerald-400"
                  }`}
                >
                  {isLoading ? "checking" : attentionCount > 0 ? "action needed" : "healthy"}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

