"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function HeaderNav() {
  const pathname = usePathname();

  const isVault = pathname.startsWith("/vault");
  const isPipeline = pathname.startsWith("/pipeline");
  const isSettings = pathname.startsWith("/settings");

  const navLink = (active: boolean) =>
    cn(
      "px-3 py-1 rounded-md text-[12px] font-mono transition-colors",
      active
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:text-foreground hover:bg-surface",
    );

  return (
    <nav className="flex items-center gap-1">
      <Link href="/vault" className={navLink(isVault)}>
        vault
      </Link>
      <Link href="/pipeline" className={navLink(isPipeline)}>
        pipeline
      </Link>
      <Link href="/settings" className={navLink(isSettings)}>
        settings
      </Link>
    </nav>
  );
}
