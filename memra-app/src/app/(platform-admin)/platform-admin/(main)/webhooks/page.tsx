"use client";

import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";

type PaymentEventRow = {
  id: string;
  paystack_event: string;
  paystack_reference: string;
  org_id: string | null;
  processed: boolean;
  error: string | null;
  created_at: string | null;
};

export default function WebhooksPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-payment-events"],
    queryFn: () => adminFetch<PaymentEventRow[]>(`/api/platform/webhooks/payment-events`),
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Webhook event log</h1>
        <div className="text-sm text-muted-foreground font-mono">
          Paystack payment_events (latest)
        </div>
      </div>

      <div className="border border-border rounded-xl p-4 overflow-auto">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground font-mono border-b border-border">
                <th className="py-2">Event</th>
                <th className="py-2">Reference</th>
                <th className="py-2">Org</th>
                <th className="py-2">Processed</th>
                <th className="py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((e) => (
                <tr key={e.id} className="border-b border-border/30">
                  <td className="py-2 font-mono text-xs">{e.paystack_event}</td>
                  <td className="py-2 font-mono text-xs">{e.paystack_reference}</td>
                  <td className="py-2 font-mono text-xs">{e.org_id ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">{e.processed ? "yes" : "no"}</td>
                  <td className="py-2 font-mono text-xs">
                    {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-sm text-muted-foreground">
                    No events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

