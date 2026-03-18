import { TooltipProvider } from "@/components/ui/tooltip";
import { ConversationProvider } from "@/components/conversation-context";
import { AppContent } from "@/components/app-content";

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
