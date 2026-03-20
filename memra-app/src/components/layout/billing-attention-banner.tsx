"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  deriveRestrictionState,
  fetchBillingSnapshot,
} from "@/lib/billing/restrictions";

/**
 * Non-blocking banner when Paystack marks the subscription as `attention`
 * (e.g. renewal payment failed). Does not change feature access.
 */
export function BillingAttentionBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: fetchBillingSnapshot,
    staleTime: 30_000,
  });

  const { showAttentionWarning, upgradeUrl } = deriveRestrictionState(data);
  if (isLoading || !showAttentionWarning) return null;

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
      <Link
        href={upgradeUrl}
        className="shrink-0 text-xs font-mono text-primary hover:underline whitespace-nowrap"
      >
        Billing →
      </Link>
    </div>
  );
}
