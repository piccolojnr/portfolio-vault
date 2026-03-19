"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type PaywallPayload = {
  error: string;
  code: string;
  limit: number;
  used: number;
  plan: string;
  upgrade_url: string;
};

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<PaywallPayload | null>(null);

  useEffect(() => {
    function onShow(ev: Event) {
      const ce = ev as CustomEvent<PaywallPayload>;
      const next = ce.detail;
      if (!next || typeof next !== "object") return;
      setPayload(next);
      setOpen(true);
    }

    window.addEventListener("paywall:show", onShow as EventListener);
    return () => window.removeEventListener("paywall:show", onShow as EventListener);
  }, []);

  const meter = useMemo(() => {
    if (!payload) return null;
    const limit = payload.limit ?? 0;
    const used = payload.used ?? 0;
    if (!limit) return { used, limit, pct: 0 };
    return { used, limit, pct: Math.min(100, (used / limit) * 100) };
  }, [payload]);

  return (
    <>
      {children}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setPayload(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upgrade required</DialogTitle>
          </DialogHeader>

          {payload ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <span className="font-mono">code:</span> {payload.code}
              </div>
              <div className="text-sm">{payload.error}</div>

              {meter && meter.limit > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                    <span>
                      {meter.used.toLocaleString()} / {meter.limit.toLocaleString()} tokens
                    </span>
                    <span>{payload.plan}</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${meter.pct}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground font-mono">
                  Plan: {payload.plan}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Not now
                </Button>
                <Button
                  onClick={() => {
                    setOpen(false);
                    router.push(payload.upgrade_url);
                  }}
                >
                  Upgrade
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

