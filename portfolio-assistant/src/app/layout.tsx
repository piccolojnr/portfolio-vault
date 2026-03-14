import "./globals.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConversationProvider } from "@/components/conversation-context";
import { AppContent } from "@/components/app-content";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portfolio Assistant",
  description: "RAG-powered assistant for Daud Rahim's portfolio vault",
  viewport: {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",   // enables env(safe-area-inset-*) on iOS
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-hidden`}
      >
        <TooltipProvider>
          <ConversationProvider>
            <AppContent>{children}</AppContent>
          </ConversationProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
