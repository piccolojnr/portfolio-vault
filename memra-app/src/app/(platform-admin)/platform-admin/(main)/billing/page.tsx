"use client";

import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Card } from "@/components/ui/card";

type BillingOverview = {
  active_subscription_count: number;
  attention_count: number;
};

export default function BillingDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-billing-overview"],
    queryFn: () => adminFetch<BillingOverview>(`/api/platform/billing/overview`),
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Billing dashboard</h1>
        <div className="text-sm text-muted-foreground font-mono">
          Subscription summary
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground font-mono">Active subscriptions</div>
          <div className="text-2xl font-mono font-semibold mt-2">
            {isLoading ? "—" : data?.active_subscription_count ?? 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground font-mono">Attention (failed payments)</div>
          <div className="text-2xl font-mono font-semibold mt-2">
            {isLoading ? "—" : data?.attention_count ?? 0}
          </div>
        </Card>
      </div>
    </div>
  );
}

