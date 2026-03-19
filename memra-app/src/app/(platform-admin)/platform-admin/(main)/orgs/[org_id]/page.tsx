"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  plan_source?: string;
  created_at: string;
};

type UsageItem = {
  call_type: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
};

type OrgDetailResponse = {
  org: OrgRow;
  members: Array<{ user_id: string; email: string; display_name: string | null; role: string; joined_at: string | null }>;
  usage_this_month: UsageItem[];
};

type BillingOrgResponse = {
  org: { id: string; plan: string; plan_source: string | null };
  subscription: any;
  payment_events: Array<{
    id: string;
    paystack_event: string;
    paystack_reference: string;
    processed: boolean;
    error: string | null;
    created_at: string | null;
  }>;
};

export default function OrgBillingPage() {
  const { org_id } = useParams<{ org_id: string }>();
  const router = useRouter();

  const orgDetailQuery = useQuery({
    queryKey: ["platform-org-detail", org_id],
    queryFn: () => adminFetch<OrgDetailResponse>(`/api/platform/orgs/${org_id}`),
    enabled: !!org_id,
  });

  const billingQuery = useQuery({
    queryKey: ["platform-org-billing", org_id],
    queryFn: () =>
      adminFetch<BillingOrgResponse>(`/api/platform/orgs/${org_id}/billing`),
    enabled: !!org_id,
  });

  const org = orgDetailQuery.data?.org;
  const billing = billingQuery.data;

  if (!org) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          <div className="max-w-5xl mx-auto space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface/40" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">{org.name}</h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {org.slug} · plan {org.plan}
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8 px-3 text-[11px] font-mono" onClick={() => router.back()}>
              back
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
              <div className="text-lg font-mono font-semibold text-foreground">
                {orgDetailQuery.data?.members.length ?? 0}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Members</div>
            </div>
            <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
              <div className="text-lg font-mono font-semibold text-foreground">
                {(orgDetailQuery.data?.usage_this_month ?? []).reduce(
                  (sum, u) => sum + u.input_tokens + u.output_tokens,
                  0,
                ).toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Monthly Tokens</div>
            </div>
            <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
              <div className="text-lg font-mono font-semibold text-foreground">
                {billing?.subscription?.status ?? "—"}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Subscription</div>
            </div>
          </div>

          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
              Members
            </h2>
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/10 border-b border-border/40">
                  <tr>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                      Email
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                      Role
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(orgDetailQuery.data?.members ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-[12px] font-mono text-muted-foreground">
                        No members found.
                      </td>
                    </tr>
                  ) : (
                    (orgDetailQuery.data?.members ?? []).map((m) => (
                      <tr key={m.user_id} className="border-t border-border/20">
                        <td className="px-3 py-2.5 font-mono text-[12px]">{m.email}</td>
                        <td className="px-3 py-2.5 font-mono text-[12px]">{m.role}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                          {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
              Usage This Month
            </h2>
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/10 border-b border-border/40">
                  <tr>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                      Type
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                      Calls
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                      Tokens
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(orgDetailQuery.data?.usage_this_month ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-[12px] font-mono text-muted-foreground">
                        No usage in this period.
                      </td>
                    </tr>
                  ) : (
                    (orgDetailQuery.data?.usage_this_month ?? []).map((u) => (
                      <tr key={u.call_type} className="border-t border-border/20">
                        <td className="px-3 py-2.5 font-mono text-[12px]">{u.call_type}</td>
                        <td className="px-3 py-2.5 font-mono text-[12px]">{u.calls.toLocaleString()}</td>
                        <td className="px-3 py-2.5 font-mono text-[12px]">
                          {(u.input_tokens + u.output_tokens).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[12px]">
                          ${u.cost_usd.toFixed(4)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
              <h2 className="text-[13px] font-semibold text-foreground font-mono">Billing & Subscription</h2>
              {billing?.subscription?.current_period_end ? (
                <span className="text-[11px] font-mono text-muted-foreground">
                  period end {new Date(billing.subscription.current_period_end).toLocaleDateString()}
                </span>
              ) : null}
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
                      Processed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(billing?.payment_events ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-[12px] font-mono text-muted-foreground">
                        No payment events.
                      </td>
                    </tr>
                  ) : (
                    (billing?.payment_events ?? []).map((e) => (
                      <tr key={e.id} className="border-t border-border/20">
                        <td className="px-3 py-2.5 font-mono text-[12px]">{e.paystack_event}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                          {e.paystack_reference}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              e.processed
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            {e.processed ? "yes" : "no"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

