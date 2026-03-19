"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";

type PaymentEventRow = {
  id: string;
  paystack_event: string;
  paystack_reference: string;
  org_id: string | null;
  processed: boolean;
  error: string | null;
  created_at: string | null;
};

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
      <div className="text-lg font-mono font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function WebhooksPage() {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  const { data, isLoading } = useQuery({
    queryKey: ["platform-payment-events", page, pageSize],
    queryFn: () =>
      adminFetch<PaymentEventRow[]>(
        `/api/platform/webhooks/payment-events?limit=${pageSize}&offset=${offset}`,
      ),
  });

  const rows = data ?? [];
  const hasNextPage = rows.length === pageSize;
  const totalEvents = rows.length;
  const processedEvents = rows.filter((e) => e.processed).length;
  const failedEvents = rows.filter((e) => Boolean(e.error)).length;
  const latestEvent = rows[0]?.paystack_event ?? "—";

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
        <div className="max-w-5xl mx-auto space-y-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Webhooks
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Incoming Paystack event stream and processing status.
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-surface/40"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Total Events" value={totalEvents} />
              <StatCard label="Processed" value={processedEvents} />
              <StatCard label="With Errors" value={failedEvents} />
              <StatCard label="Latest Event" value={latestEvent} />
            </div>
          )}

          <section className="rounded-xl border border-border/60 bg-surface/40 p-5">
            <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
              Event Log
            </h2>
            <div className="rounded-xl border border-border/60 overflow-hidden">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 rounded-lg bg-surface/40 animate-pulse"
                    />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground/50 py-8 text-center">
                  No webhook events yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/10">
                      <tr>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Event
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Reference
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Org
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Status
                        </th>
                        <th className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((event) => (
                        <tr
                          key={event.id}
                          className="border-t border-border/20 hover:bg-surface/30 transition-colors"
                        >
                          <td className="px-3 py-2.5 text-[12px] font-mono text-foreground">
                            {event.paystack_event}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] font-mono text-muted-foreground">
                            {event.paystack_reference || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] font-mono text-muted-foreground">
                            {event.org_id ?? "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                event.error
                                  ? "bg-amber-500/20 text-amber-400"
                                  : event.processed
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-muted/50 text-muted-foreground"
                              }`}
                            >
                              {event.error
                                ? "error"
                                : event.processed
                                  ? "processed"
                                  : "pending"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] font-mono text-muted-foreground">
                            {formatDateTime(event.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {!isLoading && rows.length > 0 ? (
              <div className="flex items-center gap-2 justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </Button>
                <span className="text-[12px] font-mono text-muted-foreground">
                  Page {page}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNextPage}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

