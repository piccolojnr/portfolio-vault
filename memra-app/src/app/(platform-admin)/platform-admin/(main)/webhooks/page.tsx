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
  raw_payload: Record<string, unknown> | null;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function EventBadge({ event }: { event: string }) {
  const cls: Record<string, string> = {
    "charge.success": "bg-green-500/20 text-green-400",
    "subscription.create": "bg-blue-500/20 text-blue-400",
    "subscription.disable": "bg-orange-500/20 text-orange-400",
    "subscription.not_renew": "bg-yellow-500/20 text-yellow-400",
    "invoice.create": "bg-purple-500/20 text-purple-400",
    "invoice.created": "bg-purple-500/20 text-purple-400",
    "invoice.update": "bg-indigo-500/20 text-indigo-400",
    "invoice.payment_failed": "bg-red-500/20 text-red-400",
  };
  return (
    <span
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${cls[event] ?? "bg-muted/20 text-muted-foreground"}`}
    >
      {event}
    </span>
  );
}

function RawPayloadModal({
  event,
  onClose,
}: {
  event: PaymentEventRow;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-bg border border-border/60 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <EventBadge event={event.paystack_event} />
            <span className="ml-2 text-[11px] font-mono text-muted-foreground">
              {event.id}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
          Raw Payload
        </p>
        <pre className="text-[12px] font-mono bg-muted/20 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(event.raw_payload, null, 2)}
        </pre>

        {event.error && (
          <>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-4 mb-1">
              Error
            </p>
            <pre className="text-[11px] font-mono bg-red-500/10 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-red-300 break-all">
              {event.error}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

export default function WebhooksPage() {
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<PaymentEventRow | null>(null);
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  const { data, isLoading } = useQuery({
    queryKey: ["platform-payment-events", page, pageSize],
    queryFn: () =>
      adminFetch<PaymentEventRow[]>(
        `/api/platform/webhooks/payment-events?limit=${pageSize}&offset=${offset}`,
      ),
    refetchInterval: 10000,
  });

  const rows = data ?? [];
  const hasNextPage = rows.length === pageSize;

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
                        {["Event", "Reference", "Org", "Status", "Time", ""].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((event) => (
                        <tr
                          key={event.id}
                          className={`border-t border-border/20 hover:bg-surface/30 transition-colors ${event.error ? "bg-red-500/5" : ""}`}
                        >
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <EventBadge event={event.paystack_event} />
                          </td>
                          <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground max-w-[180px] truncate">
                            {event.paystack_reference || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground max-w-[120px] truncate">
                            {event.org_id ?? "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                event.error
                                  ? "bg-red-500/20 text-red-400"
                                  : event.processed
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-muted/50 text-muted-foreground"
                              }`}
                            >
                              {event.error ? "error" : event.processed ? "processed" : "pending"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                            {formatDateTime(event.created_at)}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              className="text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => setSelectedEvent(event)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {!isLoading && rows.length > 0 && (
              <div className="flex items-center gap-2 justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  ← Prev
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
                  Next →
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>

      {selectedEvent && (
        <RawPayloadModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
