"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";

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
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold font-mono">{org.name}</h1>
          <div className="text-xs text-muted-foreground font-mono">
            {org.slug} • plan {org.plan}
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="text-xs font-mono text-muted-foreground hover:text-foreground"
        >
          Back
        </button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="billing">Billing & Subscription</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-4 space-y-4">
            <div className="text-sm font-semibold">Members</div>
            <div className="text-xs text-muted-foreground font-mono">
              {orgDetailQuery.data?.members.length ?? 0} members
            </div>
            <div className="overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 font-mono">Email</th>
                    <th className="py-2 font-mono">Role</th>
                    <th className="py-2 font-mono">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {(orgDetailQuery.data?.members ?? []).map((m) => (
                    <tr key={m.user_id} className="border-b border-border/30">
                      <td className="py-2 font-mono text-xs">{m.email}</td>
                      <td className="py-2 font-mono text-xs">{m.role}</td>
                      <td className="py-2 font-mono text-xs">
                        {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-sm font-semibold mt-2">Usage (this month)</div>
            <div className="overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 font-mono">Type</th>
                    <th className="py-2 font-mono">Tokens</th>
                    <th className="py-2 font-mono">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(orgDetailQuery.data?.usage_this_month ?? []).map((u) => (
                    <tr key={u.call_type} className="border-b border-border/30">
                      <td className="py-2 font-mono text-xs">{u.call_type}</td>
                      <td className="py-2 font-mono text-xs">
                        {(u.input_tokens + u.output_tokens).toLocaleString()}
                      </td>
                      <td className="py-2 font-mono text-xs">${u.cost_usd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <Card className="p-4 space-y-4">
            <div className="text-sm font-semibold">Subscription</div>
            <div className="text-xs text-muted-foreground font-mono">
              {billing?.subscription?.status ?? "—"}
            </div>
            {billing?.subscription?.current_period_end ? (
              <div className="text-sm font-mono">
                Period end:{" "}
                {new Date(billing.subscription.current_period_end).toLocaleDateString()}
              </div>
            ) : null}

            <div className="text-sm font-semibold mt-2">Payment events</div>
            <div className="overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 font-mono">Event</th>
                    <th className="py-2 font-mono">Reference</th>
                    <th className="py-2 font-mono">Processed</th>
                  </tr>
                </thead>
                <tbody>
                  {(billing?.payment_events ?? []).map((e) => (
                    <tr key={e.id} className="border-b border-border/30">
                      <td className="py-2 font-mono text-xs">{e.paystack_event}</td>
                      <td className="py-2 font-mono text-xs">{e.paystack_reference}</td>
                      <td className="py-2 font-mono text-xs">
                        {e.processed ? "yes" : "no"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <Card className="p-4 text-sm text-muted-foreground">
            Usage charts are not implemented yet in this iteration.
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card className="p-4 text-sm text-muted-foreground">
            Activity view is not implemented yet in this iteration.
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

