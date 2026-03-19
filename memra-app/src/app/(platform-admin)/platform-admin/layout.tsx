"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import {
  setAdminAccessToken,
  getAdminAccessToken,
  clearAdminTokens,
} from "@/lib/platform-admin";
import {
  LayoutDashboard,
  Users,
  Building2,
  ScrollText,
  Layers,
  Settings,
  HeartPulse,
  LogOut,
} from "lucide-react";

interface AdminUser {
  admin_id: string;
  email: string;
  name: string;
  must_change_password: boolean;
}

const AdminContext = createContext<AdminUser | null>(null);
export const useAdmin = () => useContext(AdminContext);

const NAV_ITEMS = [
  { href: "/platform-admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/platform-admin/users", label: "Users", icon: Users },
  { href: "/platform-admin/orgs", label: "Organisations", icon: Building2 },
  { href: "/platform-admin/logs", label: "API Logs", icon: ScrollText },
  { href: "/platform-admin/jobs", label: "Jobs", icon: Layers },
  { href: "/platform-admin/settings", label: "Settings", icon: Settings },
  { href: "/platform-admin/health", label: "System Health", icon: HeartPulse },
];

export default function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hydrate admin token from cookie
    const cookies = document.cookie.split(";").reduce(
      (acc, c) => {
        const [k, v] = c.trim().split("=");
        acc[k] = decodeURIComponent(v || "");
        return acc;
      },
      {} as Record<string, string>,
    );

    const token = cookies["admin_access_token"];
    if (token) {
      setAdminAccessToken(token);
    }

    // Fetch admin profile
    const fetchMe = async () => {
      try {
        const t = getAdminAccessToken();
        if (!t) {
          setLoading(false);
          return;
        }
        const res = await fetch("/api/platform/auth/me", {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        setAdmin(data);

        if (data.must_change_password && !pathname.endsWith("/change-password")) {
          router.push("/platform-admin/change-password");
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchMe();
  }, [pathname, router]);

  const handleLogout = async () => {
    await clearAdminTokens();
    document.cookie = "admin_access_token=; path=/; max-age=0";
    document.cookie = "admin_refresh_token=; path=/; max-age=0";
    router.push("/platform-admin/login");
  };

  // Login / change-password pages render without sidebar
  if (
    pathname === "/platform-admin/login" ||
    pathname === "/platform-admin/change-password"
  ) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f0f0f] text-neutral-400">
        Loading...
      </div>
    );
  }

  return (
    <AdminContext.Provider value={admin}>
      <div className="flex h-screen bg-[#0f0f0f] text-neutral-200">
        {/* Sidebar */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-[#0a0a0a]">
          <div className="px-4 py-5">
            <span className="text-sm font-semibold tracking-wide text-neutral-300">
              Memra Admin
            </span>
          </div>

          <nav className="flex-1 space-y-0.5 px-2">
            {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
              const active = exact
                ? pathname === href
                : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200",
                  )}
                >
                  <Icon size={15} strokeWidth={1.8} />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Admin info + logout */}
          <div className="border-t border-neutral-800 p-3">
            {admin && (
              <div className="mb-2">
                <p className="truncate text-xs font-medium text-neutral-300">
                  {admin.name}
                </p>
                <p className="truncate text-[11px] text-neutral-500">
                  {admin.email}
                </p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            >
              <LogOut size={13} />
              Logout
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}
