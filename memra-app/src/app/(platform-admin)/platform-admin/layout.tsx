"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, createContext, useContext } from "react";
import {
  setAdminAccessToken,
  getAdminAccessToken,
  clearAdminTokens,
} from "@/lib/platform-admin";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupContent,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
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

  if (
    pathname === "/platform-admin/login" ||
    pathname === "/platform-admin/change-password"
  ) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <AdminContext.Provider value={admin}>
      <SidebarProvider className="h-svh overflow-hidden">
        <Sidebar variant="sidebar" collapsible="icon">
          <SidebarHeader className="px-3 py-4">
            <span className="text-sm font-semibold tracking-wide text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              Memra Admin
            </span>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
                    const active = exact
                      ? pathname === href
                      : pathname.startsWith(href);
                    return (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton
                          render={<Link href={href} />}
                          isActive={active}
                          tooltip={label}
                          size="sm"
                        >
                          <Icon size={16} strokeWidth={1.8} />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter>
            {admin && (
              <div className="mb-1 px-2 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {admin.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {admin.email}
                </p>
              </div>
            )}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleLogout}
                  size="sm"
                  tooltip="Logout"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <LogOut size={14} />
                  <span>Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-1 h-4" />
            <span className="text-sm font-medium text-foreground">Memra Admin</span>
          </header>
          <div className="flex-1 overflow-auto min-h-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AdminContext.Provider>
  );
}
