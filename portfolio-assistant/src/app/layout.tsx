import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { HeaderNav } from "@/components/header-nav";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-screen overflow-hidden`}
      >
        {/* ── Global header ── */}
        <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border bg-bg/90 backdrop-blur-md z-20">
          <Avatar className="h-8 w-8 rounded-[8px] ring-1 ring-primary/20 bg-accent-dim shrink-0">
            <AvatarFallback className="rounded-[8px] bg-accent-dim text-primary text-[11px] font-semibold font-mono tracking-wide">
              DR
            </AvatarFallback>
          </Avatar>

          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-semibold tracking-tight text-foreground truncate">
              Portfolio Assistant
            </span>
            <Badge
              variant="outline"
              className="h-4.5 px-1.5 text-[9px] font-mono border-primary/20 text-primary/60 py-0 shrink-0"
            >
              RAG
            </Badge>
          </div>

          <div className="ml-auto">
            <HeaderNav />
          </div>
        </header>

        {/* ── Page content ── */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </body>
    </html>
  );
}
