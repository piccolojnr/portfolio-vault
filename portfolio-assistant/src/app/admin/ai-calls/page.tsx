"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAiCalls, getAiCallStats, type AiCall } from "@/lib/ai-calls";
import Link from "next/link";

const CALL_TYPES = [
  "all",
  "chat",
  "query",
  "summarise",
  "embed",
  "intent",
] as const;
type CallTypeFilter = (typeof CALL_TYPES)[number];

function formatCost(usd: number | string | null | undefined): string {
  if (usd == null) return "—";
  const n = Number(usd);
  if (isNaN(n)) return "—";
  if (n < 0.000001) return "<$0.000001";
  return `$${n.toFixed(6)}`;
}

function formatTokens(n: number | string | null | undefined): string {
  if (n == null) return "—";
  const v = Number(n);
  if (isNaN(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function TypePill({ type }: { type: string }) {
  const colors: Record<string, string> = {
    chat: "bg-primary/15 text-primary border-primary/20",
    query: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    summarise: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    embed: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    intent: "bg-muted/40 text-muted-foreground border-border/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium whitespace-nowrap ${colors[type] ?? "bg-muted/30 text-muted-foreground border-border/30"}`}
    >
      {type}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <span
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${provider === "anthropic" ? "bg-orange-500/10 text-orange-400" : "bg-emerald-500/10 text-emerald-400"}`}
    >
      {provider}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
      <div className="text-lg font-mono font-semibold text-foreground">
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      {sub && (
        <div className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">
          {sub}
        </div>
      )}
    </div>
  );
}

export default function AiCallsPage() {
  const [typeFilter, setTypeFilter] = useState<CallTypeFilter>("all");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: stats } = useQuery({
    queryKey: ["ai-call-stats"],
    queryFn: getAiCallStats,
    staleTime: 30_000,
  });

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["ai-calls", typeFilter, offset],
    queryFn: () =>
      getAiCalls({
        call_type: typeFilter === "all" ? undefined : typeFilter,
        limit,
        offset,
      }),
    staleTime: 15_000,
  });

  const totalTokens =
    stats?.by_type.reduce((s, r) => s + Number(r.input_tokens) + Number(r.output_tokens), 0) ??
    0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Total cost"
            value={stats ? `$${Number(stats.total_cost_usd).toFixed(4)}` : "—"}
          />
          <StatCard
            label="Total calls"
            value={stats ? String(stats.total_calls) : "—"}
          />
          <StatCard label="Total tokens" value={formatTokens(totalTokens)} />
          <StatCard
            label="Avg cost / call"
            value={
              stats && stats.total_calls > 0
                ? `$${(Number(stats.total_cost_usd) / stats.total_calls).toFixed(6)}`
                : "—"
            }
          />
        </div>

        {/* Cost by type */}
        {stats && stats.by_type.length > 0 && (
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead className="border-b border-border/40 bg-muted/10">
                <tr>
                  {[
                    "Type",
                    "Calls",
                    "Input tokens",
                    "Output tokens",
                    "Cost (USD)",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.by_type.map((row) => (
                  <tr
                    key={row.call_type}
                    className="border-t border-border/20 hover:bg-surface/30 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <TypePill type={row.call_type} />
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-foreground">
                      {row.calls}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-muted-foreground">
                      {formatTokens(row.input_tokens)}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-muted-foreground">
                      {formatTokens(row.output_tokens)}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-foreground font-medium">
                      {formatCost(row.cost_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {CALL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTypeFilter(t);
                setOffset(0);
              }}
              className={`px-3 py-1 rounded-md text-[12px] font-mono transition-colors ${typeFilter === t ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Call log table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-surface/40 animate-pulse"
              />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 py-4">
            No calls logged yet.
          </p>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead className="border-b border-border/40 bg-muted/10">
                <tr>
                  {[
                    "Type",
                    "Model",
                    "Provider",
                    "In tokens",
                    "Out tokens",
                    "Cost",
                    "Linked to",
                    "When",
                  ].map((h) => (
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
                {calls.map((call) => (
                  <tr
                    key={call.id}
                    className="border-t border-border/20 hover:bg-surface/30 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <TypePill type={call.call_type} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {call.model}
                    </td>
                    <td className="px-3 py-2.5">
                      <ProviderBadge provider={call.provider} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground">
                      {formatTokens(call.input_tokens)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground">
                      {formatTokens(call.output_tokens)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-foreground font-medium">
                      {formatCost(call.cost_usd)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono">
                      {call.conversation_id && (
                        <Link
                          href={`/${call.conversation_id}`}
                          className="text-primary hover:underline"
                        >
                          conv
                        </Link>
                      )}
                      {call.doc_id && (
                        <Link
                          href="/documents"
                          className="text-primary hover:underline ml-2"
                        >
                          doc
                        </Link>
                      )}
                      {!call.conversation_id && !call.doc_id && (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {formatDate(call.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(calls.length === limit || offset > 0) && (
          <div className="flex items-center gap-2 justify-center pb-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-[11px] font-mono text-muted-foreground/50">
              {offset + 1}–{offset + calls.length}
            </span>
            <button
              type="button"
              disabled={calls.length < limit}
              onClick={() => setOffset(offset + limit)}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
