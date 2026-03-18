"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { setAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface OrgOption {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
}

export function OrgSwitcher() {
  const { org, refresh } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleOpen = async () => {
    if (!open) {
      setLoading(true);
      try {
        const res = await fetch("/api/orgs");
        if (res.ok) setOrgs(await res.json());
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    setOpen((v) => !v);
  };

  const switchOrg = async (orgId: string) => {
    if (orgId === org?.id) {
      setOpen(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      if (res.ok) {
        const { access_token } = await res.json();
        setAccessToken(access_token);
        await refresh();
        router.refresh();
      }
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!org) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
      >
        <span className="max-w-[120px] truncate">{org.name}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          className={cn("transition-transform", open && "rotate-180")}
        >
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[160px] bg-surface border border-border rounded-md shadow-lg z-50 py-1">
          {loading ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">Loading…</div>
          ) : orgs.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">No orgs found</div>
          ) : (
            orgs.map((o) => (
              <button
                key={o.id}
                onClick={() => switchOrg(o.id)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-[11px] font-mono hover:bg-primary/10 transition-colors",
                  o.id === org.id ? "text-primary" : "text-foreground",
                )}
              >
                {o.name}
                {o.id === org.id && <span className="ml-1 text-muted-foreground">✓</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
