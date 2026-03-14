"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function HeaderNav() {
  const pathname = usePathname();
  const isChat = pathname === "/" || pathname.startsWith("/chat");
  const isVault = pathname.startsWith("/vault");
  const isPipeline = pathname.startsWith("/pipeline");

  const navLink = (href: string, label: string, active: boolean) =>
    cn(
      "px-3 py-1 rounded-md text-[12px] font-mono transition-colors",
      active
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:text-foreground hover:bg-surface"
    );

  return (
    <nav className="flex items-center gap-1">
      <Link href="/" className={navLink("/", "chat", isChat)}>
        chat
      </Link>
      <Link href="/vault" className={navLink("/vault", "vault", isVault)}>
        vault
      </Link>
      <Link href="/pipeline" className={navLink("/pipeline", "pipeline", isPipeline)}>
        pipeline
      </Link>
    </nav>
  );
}
