import { apiFetch } from "@/lib/network/api";

export type BillingSnapshot = {
  plan: string;
  subscription_status: string | null;
  subscription_blocked?: boolean;
  subscription_block_code?: "subscription_expired" | "subscription_past_due" | null;
  upgrade_url?: string;
  usage: {
    tokens_used: number;
    monthly_token_limit: number | null;
  };
  limits: {
    documents: { used: number; max: number | null };
  };
  policy?: {
    documents?: {
      existing_documents_access?: string;
      new_document_uploads?: string;
      reingest_existing_documents?: string;
      over_limit?: boolean;
    };
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
  const isSubscriptionBlocked = !!billing.subscription_blocked;
  const isDocumentLimitReached =
    billing.limits.documents.max != null &&
    billing.limits.documents.used >= billing.limits.documents.max;
  const isTokenLimitReached =
    billing.usage.monthly_token_limit != null &&
    billing.usage.tokens_used >= billing.usage.monthly_token_limit;

  let reason: string | null = null;
  if (isSubscriptionBlocked) {
    if (billing.subscription_block_code === "subscription_expired") {
      reason = "Your subscription period ended and renewal did not complete.";
    } else if (billing.subscription_block_code === "subscription_past_due") {
      reason = "Your subscription is past due. Update billing to restore access.";
    } else {
      reason = "Your subscription is not active. Upgrade or fix billing to continue.";
    }
  } else if (isDocumentLimitReached) {
    reason =
      "You have reached your document limit for the current plan. Existing documents remain accessible, but new uploads are blocked until you upgrade or reduce document count.";
  } else if (isTokenLimitReached) {
    reason = "You have reached your monthly token limit for the current plan.";
  }

  const blockReadonlyViews = isSubscriptionBlocked;
  const blockDocumentCreate =
    isSubscriptionBlocked || isDocumentLimitReached || isTokenLimitReached;
  const blockReingest = isSubscriptionBlocked || isTokenLimitReached;
  const blockDocumentEdit = isSubscriptionBlocked;
  const blockChatSend = isSubscriptionBlocked || isTokenLimitReached;
  const showAttentionWarning = subscriptionStatus === "attention" && !isSubscriptionBlocked;

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
