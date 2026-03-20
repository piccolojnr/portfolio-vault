import { apiFetch } from "@/lib/network/api";

export type BillingSnapshot = {
  plan: string;
  subscription_status: string | null;
  upgrade_url?: string;
  usage: {
    tokens_used: number;
    monthly_token_limit: number | null;
  };
  limits: {
    documents: { used: number; max: number | null };
  };
};

export type RestrictionState = {
  hasBilling: boolean;
  isSubscriptionBlocked: boolean;
  /** Paystack failed renewal / invoice issue — informational only (not a hard block). */
  showAttentionWarning: boolean;
  isDocumentLimitReached: boolean;
  isTokenLimitReached: boolean;
  blockReadonlyViews: boolean;
  blockDocumentCreate: boolean;
  blockReingest: boolean;
  blockDocumentEdit: boolean;
  blockChatSend: boolean;
  reason: string | null;
  upgradeUrl: string;
};

const SUBSCRIPTION_BLOCKED = new Set(["expired", "past_due", "unpaid", "cancelled", "canceled"]);

export function deriveRestrictionState(
  billing: BillingSnapshot | null | undefined,
): RestrictionState {
  if (!billing) {
    return {
      hasBilling: false,
      isSubscriptionBlocked: false,
      showAttentionWarning: false,
      isDocumentLimitReached: false,
      isTokenLimitReached: false,
      blockReadonlyViews: false,
      blockDocumentCreate: false,
      blockReingest: false,
      blockDocumentEdit: false,
      blockChatSend: false,
      reason: null,
      upgradeUrl: "/settings/billing",
    };
  }

  const subscriptionStatus = billing.subscription_status?.toLowerCase() ?? null;
  const isSubscriptionBlocked =
    !!subscriptionStatus && SUBSCRIPTION_BLOCKED.has(subscriptionStatus);
  const isDocumentLimitReached =
    billing.limits.documents.max != null &&
    billing.limits.documents.used >= billing.limits.documents.max;
  const isTokenLimitReached =
    billing.usage.monthly_token_limit != null &&
    billing.usage.tokens_used >= billing.usage.monthly_token_limit;

  let reason: string | null = null;
  if (isSubscriptionBlocked) {
    reason = "Your subscription is not active. Upgrade or fix billing to continue.";
  } else if (isDocumentLimitReached) {
    reason = "You have reached your document limit for the current plan.";
  } else if (isTokenLimitReached) {
    reason = "You have reached your monthly token limit for the current plan.";
  }

  const blockReadonlyViews = isSubscriptionBlocked;
  const blockDocumentCreate = isSubscriptionBlocked || isDocumentLimitReached;
  const blockReingest = isSubscriptionBlocked || isTokenLimitReached;
  const blockDocumentEdit = isSubscriptionBlocked;
  const blockChatSend = isSubscriptionBlocked || isTokenLimitReached;
  const showAttentionWarning = subscriptionStatus === "attention";

  return {
    hasBilling: true,
    isSubscriptionBlocked,
    showAttentionWarning,
    isDocumentLimitReached,
    isTokenLimitReached,
    blockReadonlyViews,
    blockDocumentCreate,
    blockReingest,
    blockDocumentEdit,
    blockChatSend,
    reason,
    upgradeUrl: billing.upgrade_url ?? "/settings/billing",
  };
}

export function fetchBillingSnapshot(): Promise<BillingSnapshot> {
  return apiFetch<BillingSnapshot>("/api/billing/restrictions");
}
