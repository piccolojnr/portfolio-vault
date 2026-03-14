"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function HeaderNav() {
  const pathname = usePathname();
  const isVault = pathname.startsWith("/vault");

  return (
    <nav className="flex items-center gap-1">
      <Link
        href="/"
        className={cn(
          "px-3 py-1 rounded-md text-[12px] font-mono transition-colors",
          !isVault
            ? "text-primary bg-primary/10"
            : "text-muted-foreground hover:text-foreground hover:bg-surface"
        )}
      >
        chat
      </Link>
      <Link
        href="/vault"
        className={cn(
          "px-3 py-1 rounded-md text-[12px] font-mono transition-colors",
          isVault
            ? "text-primary bg-primary/10"
            : "text-muted-foreground hover:text-foreground hover:bg-surface"
        )}
      >
        vault
      </Link>
    </nav>
  );
}
