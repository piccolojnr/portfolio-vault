import { TooltipProvider } from "@/components/ui/tooltip";
import { ConversationProvider } from "@/components/providers/conversation-context";
import { AppContent } from "@/components/layout/app-content";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <ConversationProvider>
        <AppContent>{children}</AppContent>
      </ConversationProvider>
    </TooltipProvider>
  );
}
