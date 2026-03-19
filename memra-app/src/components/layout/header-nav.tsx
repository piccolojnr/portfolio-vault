"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { OrgSwitcher } from "./org-switcher";
import { Skeleton } from "../ui/skeleton";

export function HeaderNav() {
  const pathname = usePathname();
  const { user, org, isAuthenticated, logout, isLoading } = useAuth();
  const canManage = org?.role === "admin" || org?.role === "owner";

  const isVault = pathname.startsWith("/documents");
  const isGraph = pathname.startsWith("/graph");
  // const isAdmin =
    // pathname.startsWith("/admin") && pathname !== "/admin/settings";
  const isOrgSettings = pathname.startsWith("/settings/organisation");
  const isProfile = pathname.startsWith("/settings/profile");
  const isBilling = pathname.startsWith("/settings/billing");

  const navLink = (active: boolean) =>
    cn(
      "px-3 py-1 rounded-md text-[12px] font-mono transition-colors",
      active
        ? "text-primary bg-primary/10"
        : "text-muted-foreground hover:text-foreground hover:bg-surface",
    );

  return (
    <nav className="flex items-center gap-1">
      {isLoading ? (
        <div
          className="flex items-center gap-1"
        >
          <Skeleton className="w-10 h-4" />
          <Skeleton className="w-10 h-4" />
        </div>
      ) : (
        <>
      <Link href="/documents" className={navLink(isVault)}>
        documents
      </Link>
      <Link href="/graph" className={navLink(isGraph)}>
        graph
      </Link>
      {canManage && (
        <Link href="/settings/organisation" className={navLink(isOrgSettings)}>
          org
        </Link>
      )}
      {canManage && (
        <Link href="/settings/billing" className={navLink(isBilling)}>
          billing
        </Link>
      )}
      {/* users should not see this */}
      {/* {canManage && (
        <Link href="/admin/jobs" className={navLink(isAdmin)}>
          admin
        </Link>
      )} */}

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
      </>
      )}
    </nav>
  );
}
