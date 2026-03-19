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
  CreditCard,
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
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/users", label: "Users", icon: Users },
  { href: "/orgs", label: "Organisations", icon: Building2 },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/logs", label: "API Logs", icon: ScrollText },
  { href: "/jobs", label: "Jobs", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/health", label: "System Health", icon: HeartPulse },
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
          router.push("/change-password");
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
    router.push("/login");
  };

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
                      <SidebarMenuItem key={href} className="mb-1">
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
        <SidebarInset className="min-h-0 overflow-hidden">
          <header className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border bg-bg/90 backdrop-blur-md z-20">
            <SidebarTrigger className="shrink-0 text-muted-foreground hover:text-foreground" />
            <Separator orientation="vertical" className="" />
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Platform Admin
            </span>
          </header>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AdminContext.Provider>
  );
}
