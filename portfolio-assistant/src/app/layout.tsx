import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="flex items-center gap-3.5 px-6 py-4 border-b border-border bg-bg/80 backdrop-blur-md sticky top-0 z-20">
          <Avatar className="h-9 w-9 rounded-[10px] ring-1 ring-primary/20 bg-accent-dim shrink-0">
            <AvatarFallback className="rounded-[10px] bg-accent-dim text-primary text-[13px] font-medium font-mono tracking-wide">
              DR
            </AvatarFallback>
          </Avatar>

          <div>
            <div className="text-sm font-semibold tracking-tight text-foreground">
              Portfolio Assistant
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[10px] font-mono border-primary/20 text-primary/70 py-0"
              >
                RAG
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                knows your vault
              </span>
            </div>
          </div>

          <nav className="ml-auto flex items-center gap-4">
            <Link
              href="/vault"
              className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              vault
            </Link>
          </nav>
        </header>

        {children}
      </body>
    </html>
  );
}
