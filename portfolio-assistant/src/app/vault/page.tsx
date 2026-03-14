"use client";

import { useEffect, useRef, useState } from "react";
import {
  listDocuments,
  triggerReindex,
  getReindexStatus,
  type VaultDocSummary,
  type ReindexStatus,
} from "@/lib/vault";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  project: "default",
  brag: "secondary",
  bio: "outline",
  skills: "outline",
  experience: "outline",
};

export default function VaultPage() {
  const [docs, setDocs] = useState<VaultDocSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reindex state
  const [reindexRunId, setReindexRunId] = useState<string | null>(null);
  const [reindexStatus, setReindexStatus] = useState<ReindexStatus | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch((e: Error) => setError(e.message));
  }, []);

  // Poll when a run is active
  useEffect(() => {
    if (!reindexRunId || reindexStatus?.status === "success" || reindexStatus?.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const status = await getReindexStatus(reindexRunId);
        setReindexStatus(status);
        if (status.status === "success" || status.status === "failed") {
          setReindexing(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // keep polling
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [reindexRunId, reindexStatus?.status]);

  async function handleReindex() {
    setReindexing(true);
    setReindexStatus(null);
    try {
      const { run_id } = await triggerReindex();
      setReindexRunId(run_id);
    } catch (e: unknown) {
      setReindexing(false);
      setReindexStatus({
        run_id: "",
        status: "failed",
        chunk_count: null,
        started_at: new Date().toISOString(),
        finished_at: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function reindexLabel() {
    if (reindexing) return "Indexing…";
    if (reindexStatus?.status === "success")
      return `✓ Done (${reindexStatus.chunk_count} chunks)`;
    if (reindexStatus?.status === "failed")
      return `✗ Failed: ${reindexStatus.error ?? "unknown error"}`;
    return "Re-index";
  }

  return (
    <div className="bg-bg text-foreground">
      {/* Sub-header: re-index action */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-end">
        <Button
          onClick={handleReindex}
          disabled={reindexing}
          variant={reindexStatus?.status === "failed" ? "destructive" : "default"}
          size="sm"
          className={
            reindexStatus?.status === "success"
              ? "bg-green-700 hover:bg-green-700 text-white"
              : ""
          }
        >
          {reindexing && (
            <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {reindexLabel()}
        </Button>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <p className="text-destructive text-sm mb-4">{error}</p>
        )}

        {docs === null && !error && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-md bg-surface animate-pulse"
              />
            ))}
          </div>
        )}

        {docs !== null && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-left">
                <th className="pb-3 pr-4 font-medium w-28">Type</th>
                <th className="pb-3 pr-4 font-medium">Title</th>
                <th className="pb-3 pr-4 font-mono font-medium">Slug</th>
                <th className="pb-3 font-medium text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr
                  key={doc.slug}
                  className="border-b border-border/50 hover:bg-surface/60 cursor-pointer transition-colors"
                  onClick={() => window.location.assign(`/vault/${doc.slug}`)}
                >
                  <td className="py-3 pr-4">
                    <Badge variant={TYPE_VARIANT[doc.type] ?? "outline"}>
                      {doc.type}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 font-medium">{doc.title || doc.slug}</td>
                  <td className="py-3 pr-4 font-mono text-muted-foreground">{doc.slug}</td>
                  <td className="py-3 text-right text-muted-foreground">
                    {formatRelative(doc.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
