"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-provider";
import { OrgSwitcher } from "./org-switcher";

export function HeaderNav() {
  const pathname = usePathname();
  const { user, org, isAuthenticated, logout } = useAuth();
  const canManage = org?.role === "admin" || org?.role === "owner";

  const isVault = pathname.startsWith("/documents");
  const isSettings = pathname.startsWith("/settings") && !pathname.startsWith("/settings/profile") && !pathname.startsWith("/settings/organisation");
  const isGraph = pathname.startsWith("/graph");
  const isAdmin = pathname.startsWith("/admin");
  const isOrgSettings = pathname.startsWith("/settings/organisation");
  const isProfile = pathname.startsWith("/settings/profile");

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
      <Link href="/graph" className={navLink(isGraph)}>
        graph
      </Link>
      {canManage && (
        <Link href="/settings" className={navLink(isSettings)}>
          settings
        </Link>
      )}
      {canManage && (
        <Link href="/settings/organisation" className={navLink(isOrgSettings)}>
          org
        </Link>
      )}
      {canManage && (
        <Link href="/admin/jobs" className={navLink(isAdmin)}>
          admin
        </Link>
      )}

      {isAuthenticated && (
        <>
          <div className="w-px h-4 bg-border mx-1" />
          <Link href="/settings/profile" className={navLink(isProfile)}>
            profile
          </Link>
          <OrgSwitcher />
          <button
            onClick={logout}
            className="px-2 py-1 rounded-md text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
            title={user?.email}
          >
            sign out
          </button>
        </>
      )}
    </nav>
  );
}
