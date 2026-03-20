"use client";

import { useQuery } from "@tanstack/react-query";
import { ChatInterface } from "@/components/chat/chat-interface";
import {
  deriveRestrictionState,
  fetchBillingSnapshot,
} from "@/lib/billing/restrictions";

export default function Home() {
  const { data: billingData } = useQuery({
    queryKey: ["billing"],
    queryFn: fetchBillingSnapshot,
    staleTime: 30_000,
  });
  const restrictions = deriveRestrictionState(billingData);
  return (
    <ChatInterface
      key="new"
      chatBlocked={restrictions.blockChatSend || restrictions.blockReadonlyViews}
      chatBlockedReason={
        restrictions.reason ??
        "Your plan currently restricts sending messages. Upgrade to continue."
      }
      upgradeUrl={restrictions.upgradeUrl}
    />
  );
}
