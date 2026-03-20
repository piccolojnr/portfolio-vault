import { TooltipProvider } from "@/components/ui/tooltip";
import { ConversationProvider } from "@/components/providers/conversation-context";
import { AppContent } from "@/components/layout/app-content";
import { PaywallProvider } from "@/components/providers/paywall-provider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <PaywallProvider>
        <ConversationProvider>
          <AppContent>{children}</AppContent>
        </ConversationProvider>
      </PaywallProvider>
    </TooltipProvider>
  );
}
