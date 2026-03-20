"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatInterface } from "@/components/chat/chat-interface";
import {
  deriveRestrictionState,
  fetchBillingSnapshot,
} from "@/lib/billing/restrictions";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: billingData } = useQuery({
    queryKey: ["billing"],
    queryFn: fetchBillingSnapshot,
    staleTime: 30_000,
  });
  const restrictions = deriveRestrictionState(billingData);

  return (
    <ChatInterface
      key={slug}
      slug={slug}
      chatBlocked={restrictions.blockChatSend || restrictions.blockReadonlyViews}
      chatBlockedReason={
        restrictions.reason ??
        "Your plan currently restricts sending messages. Upgrade to continue."
      }
      upgradeUrl={restrictions.upgradeUrl}
    />
  );
}
