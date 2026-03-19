"use client";

import { use } from "react";
import { ChatInterface } from "@/components/chat/chat-interface";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  return <ChatInterface key={slug} slug={slug} />;
}
