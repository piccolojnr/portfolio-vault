import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/components/query-provider";
import { ConversationProvider } from "@/components/conversation-context";
import { AuthProvider } from "@/components/auth-provider";
import { AppContent } from "@/components/app-content";
import { Toaster } from "sonner";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <TooltipProvider>
        <AuthProvider>
          <ConversationProvider>
            <AppContent>{children}</AppContent>
          </ConversationProvider>
        </AuthProvider>
      </TooltipProvider>
      <Toaster position="bottom-right" />
    </QueryProvider>
  );
}
