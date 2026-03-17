"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function HeaderNav() {
  const pathname = usePathname();

  const isVault = pathname.startsWith("/documents");
  const isPipeline = pathname.startsWith("/pipeline");
  const isSettings = pathname.startsWith("/settings");
  const isGraph = pathname.startsWith("/graph");

  const navLink = (active: boolean) =>
    cn(
      "px-3 py-1 rounded-md text-[12px] font-mono transition-colors",
      active
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:text-foreground hover:bg-surface",
    );

  return (
    <nav className="flex items-center gap-1">
      <Link href="/documents" className={navLink(isVault)}>
        documents
      </Link>
      <Link href="/pipeline" className={navLink(isPipeline)}>
        pipeline
      </Link>
      <Link href="/settings" className={navLink(isSettings)}>
        settings
      </Link>
      <Link href="/graph" className={navLink(isGraph)}>
        graph
      </Link>
    </nav>
  );
}
