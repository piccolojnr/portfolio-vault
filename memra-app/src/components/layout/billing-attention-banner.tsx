"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  deriveRestrictionState,
  fetchBillingSnapshot,
} from "@/lib/billing/restrictions";
import { useAuth } from "@/components/providers/auth-provider";
import { apiFetch } from "@/lib/network/api";

/**
 * Non-blocking banner when Paystack marks the subscription as `attention`
 * (e.g. renewal payment failed). Does not change feature access.
 */
export function BillingAttentionBanner() {
  const { org } = useAuth();
  const [resolving, setResolving] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: fetchBillingSnapshot,
    staleTime: 30_000,
  });

  const { showAttentionWarning, upgradeUrl } = deriveRestrictionState(data);
  if (isLoading || !showAttentionWarning) return null;

  const canResolve = org?.role === "owner";

  async function handleResolve() {
    if (!canResolve || resolving) return;
    setResolving(true);
    try {
      const res = await apiFetch<{ authorization_url: string }>(
        "/api/billing/resolve",
        {
          method: "POST",
        },
      );
      if (res.authorization_url) {
        window.location.href = res.authorization_url;
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <div
      role="status"
      className="shrink-0 flex items-center justify-center gap-3 px-3 sm:px-4 py-2 border-b border-amber-500/25 bg-amber-500/10 text-center sm:text-left"
    >
      <span className="text-amber-400 text-sm shrink-0" aria-hidden>
        ⚠
      </span>
      <p className="text-xs sm:text-sm text-amber-200/95 flex-1 min-w-0">
        <span className="font-medium text-amber-100">Payment issue on your subscription.</span>{" "}
        Update your billing details so service isn&apos;t interrupted.
      </p>
      {canResolve ? (
        <button
          type="button"
          onClick={() => void handleResolve()}
          disabled={resolving}
          className="shrink-0 text-xs font-mono text-primary hover:underline whitespace-nowrap disabled:opacity-50"
        >
          {resolving ? "Opening…" : "Fix payment →"}
        </button>
      ) : (
        <Link
          href={upgradeUrl}
          className="shrink-0 text-xs font-mono text-primary hover:underline whitespace-nowrap"
        >
          Billing →
        </Link>
      )}
    </div>
  );
}
