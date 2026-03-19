"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface PlatformSetting {
  key: string;
  value: string;
  is_secret: boolean;
  description: string;
  updated_at: string | null;
  has_value: boolean;
  source?: "database" | "environment" | "none";
}

interface ModelConfig {
  model_id: string;
  model_name: string;
  model_type: string;
  provider: string;
  min_plan: string;
  enabled: boolean;
  created_at: string | null;
}

interface PlanLimitRow {
  plan_tier: string;
  monthly_token_limit: number | null;
  max_documents: number | null;
  max_corpora: number | null;
  max_members: number | null;
  overage_rate_per_500k_tokens: number;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
      {children}
    </h2>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border/40 bg-surface/30">
      <div className="text-lg font-mono font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function FieldRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2.5">
      <label className="w-44 shrink-0 text-[12px] font-mono text-muted-foreground">
        {label}
      </label>
      <div className="flex-1 min-w-0">{children}</div>
      {hint && (
        <p className="text-[10px] text-muted-foreground/50 font-mono sm:w-32 sm:text-right shrink-0">
          {hint}
        </p>
      )}
    </div>
  );
}

function formatDaysAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function SettingRow({ s }: { s: PlatformSetting }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(s.value);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (value: string) => {
      await adminFetch(`/api/platform/settings/${encodeURIComponent(s.key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform", "settings"] });
      setEditing(false);
    },
  });

  const reveal = useCallback(async () => {
    const res = await adminFetch<{ key: string; value: string }>(
      `/api/platform/settings/${encodeURIComponent(s.key)}/reveal`
    );
    setRevealedValue(res.value);
    setTimeout(() => setRevealedValue(null), 10000);
  }, [s.key]);

  const displayValue =
    revealedValue !== null
      ? revealedValue
      : s.is_secret && s.has_value && !editing
        ? "••••••••"
        : editing
          ? editValue
          : s.value;

  const startEditing = () => {
    setEditValue(s.is_secret ? "" : s.value);
    setEditing(true);
  };

  const sourceLabel = s.source === "environment" ? "env" : s.source === "database" ? "db" : null;

  return (
    <FieldRow
      label={s.key}
      hint={`updated ${formatDaysAgo(s.updated_at)}${sourceLabel ? ` · ${sourceLabel}` : ""}`}
    >
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type={s.is_secret ? "password" : "text"}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={s.is_secret && s.has_value ? "••••••••" : ""}
            autoFocus
            className="flex-1 min-w-0 basis-full sm:basis-auto bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(editValue)}
            disabled={saveMutation.isPending}
            className="h-7 px-3 text-[11px] font-mono"
          >
            {saveMutation.isPending ? "…" : "save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            className="h-7 px-2 text-[11px] font-mono"
          >
            cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {s.has_value ? (
            <span className={`text-[11px] font-mono ${revealedValue !== null ? "text-amber-400" : s.is_secret ? "text-green-400" : "text-foreground"}`}>
              {s.is_secret ? (revealedValue ?? "● set") : (displayValue || "—")}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-muted-foreground/50">
              ○ not set
            </span>
          )}
          <button
            onClick={startEditing}
            className="text-[11px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-2"
          >
            {s.has_value ? "update" : "set"}
          </button>
          {s.is_secret && s.has_value && (
            <button
              onClick={reveal}
              className="text-[11px] font-mono text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              reveal
            </button>
          )}
        </div>
      )}
    </FieldRow>
  );
}

function ModelRow({ m }: { m: ModelConfig }) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (updates: { min_plan?: string; enabled?: boolean }) => {
      await adminFetch(
        `/api/platform/models/${encodeURIComponent(m.model_id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform", "models"] });
    },
  });

  const providerColor = m.provider === "anthropic"
    ? "bg-orange-500/10 text-orange-400"
    : "bg-emerald-500/10 text-emerald-400";

  const typeColor: Record<string, string> = {
    chat: "bg-primary/15 text-primary border-primary/20",
    embed: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    classify: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  };

  return (
    <div className="flex items-center justify-between py-2.5 gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono text-foreground">{m.model_name}</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${providerColor}`}>
            {m.provider}
          </span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium ${typeColor[m.model_type] ?? "bg-muted/30 text-muted-foreground border-border/30"}`}>
            {m.model_type}
          </span>
        </div>
        <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">{m.model_id}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <select
          value={m.min_plan}
          onChange={(e) => updateMutation.mutate({ min_plan: e.target.value })}
          className="bg-surface border border-border rounded-md px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer"
        >
          <option value="free">free</option>
          <option value="pro">pro</option>
          <option value="enterprise">enterprise</option>
        </select>
        <Switch
          checked={m.enabled}
          onCheckedChange={(v) => updateMutation.mutate({ enabled: v })}
          size="sm"
        />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newModel, setNewModel] = useState({
    model_id: "",
    model_name: "",
    model_type: "chat",
    provider: "anthropic",
    min_plan: "free",
    enabled: false,
  });

  const settingsQuery = useQuery({
    queryKey: ["platform", "settings"],
    queryFn: () => adminFetch<PlatformSetting[]>("/api/platform/settings"),
  });

  const modelsQuery = useQuery({
    queryKey: ["platform", "models"],
    queryFn: () => adminFetch<ModelConfig[]>("/api/platform/models"),
  });

  const planLimitsQuery = useQuery({
    queryKey: ["platform", "plan-limits"],
    queryFn: () => adminFetch<PlanLimitRow[]>("/api/platform/plan-limits"),
  });

  const [planEdits, setPlanEdits] = useState<Record<string, Partial<PlanLimitRow>>>({});

  const planLimitsUpdateMutation = useMutation({
    mutationFn: async () => {
      const rows = (planLimitsQuery.data ?? []).map((r) => ({
        ...r,
        ...(planEdits[r.plan_tier] ?? {}),
      }));
      await adminFetch("/api/platform/plan-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          rows.map((r) => ({
            plan_tier: r.plan_tier,
            monthly_token_limit: r.monthly_token_limit,
            max_documents: r.max_documents,
            max_corpora: r.max_corpora,
            max_members: r.max_members,
            overage_rate_per_500k_tokens: r.overage_rate_per_500k_tokens,
          })),
        ),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform", "plan-limits"] });
      setPlanEdits({});
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: typeof newModel) => {
      await adminFetch("/api/platform/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform", "models"] });
      setAddOpen(false);
      setNewModel({ model_id: "", model_name: "", model_type: "chat", provider: "anthropic", min_plan: "free", enabled: false });
    },
  });

  const secretSettings = settingsQuery.data?.filter((s) => s.is_secret) ?? [];
  const nonSecretSettings = settingsQuery.data?.filter((s) => !s.is_secret) ?? [];
  const enabledModels = (modelsQuery.data ?? []).filter((m) => m.enabled).length;

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Settings
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Platform-wide API keys, configuration, and model management.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="API Keys" value={secretSettings.length} />
            <StatCard label="Config Entries" value={nonSecretSettings.length} />
            <StatCard label="Models Enabled" value={enabledModels} />
            <StatCard label="Plan Tiers" value={planLimitsQuery.data?.length ?? 0} />
          </div>

          {/* API Keys */}
          {settingsQuery.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/20" />
              ))}
            </div>
          ) : (
            <>
              {secretSettings.length > 0 && (
                <section className="rounded-xl border border-border/60 bg-surface/40 p-5">
                  <SectionHeading>API Keys</SectionHeading>
                  <div className="divide-y divide-border/30">
                    {secretSettings.map((s) => (
                      <SettingRow key={s.key} s={s} />
                    ))}
                  </div>
                </section>
              )}

              {nonSecretSettings.length > 0 && (
                <section className="rounded-xl border border-border/60 bg-surface/40 p-5">
                  <SectionHeading>Configuration</SectionHeading>
                  <div className="divide-y divide-border/30">
                    {nonSecretSettings.map((s) => (
                      <SettingRow key={s.key} s={s} />
                    ))}
                  </div>
                </section>
              )}

              {!settingsQuery.data?.length && (
                <p className="text-sm text-muted-foreground/50 py-4">
                  No settings configured.
                </p>
              )}
            </>
          )}

          {/* Model Configuration */}
          <section className="rounded-xl border border-border/60 bg-surface/40 p-5">
            <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
              <h2 className="text-[13px] font-semibold text-foreground font-mono">
                Model Configuration
              </h2>
              <button
                onClick={() => setAddOpen(!addOpen)}
                className="text-[11px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-2"
              >
                {addOpen ? "cancel" : "+ add model"}
              </button>
            </div>

            {addOpen && (
              <div className="mb-4 p-4 rounded-lg bg-muted/10 border border-border/30 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-mono block mb-1">Model ID</label>
                    <input
                      value={newModel.model_id}
                      onChange={(e) => setNewModel((p) => ({ ...p, model_id: e.target.value }))}
                      placeholder="e.g. gpt-4"
                      className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-mono block mb-1">Model Name</label>
                    <input
                      value={newModel.model_name}
                      onChange={(e) => setNewModel((p) => ({ ...p, model_name: e.target.value }))}
                      placeholder="e.g. GPT-4"
                      className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-mono block mb-1">Type</label>
                    <select
                      value={newModel.model_type}
                      onChange={(e) => setNewModel((p) => ({ ...p, model_type: e.target.value }))}
                      className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer"
                    >
                      <option value="chat">chat</option>
                      <option value="embed">embed</option>
                      <option value="classify">classify</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-mono block mb-1">Provider</label>
                    <select
                      value={newModel.provider}
                      onChange={(e) => setNewModel((p) => ({ ...p, provider: e.target.value }))}
                      className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer"
                    >
                      <option value="anthropic">anthropic</option>
                      <option value="openai">openai</option>
                    </select>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => createMutation.mutate(newModel)}
                  disabled={createMutation.isPending || !newModel.model_id.trim() || !newModel.model_name.trim()}
                  className="h-7 px-3 text-[11px] font-mono"
                >
                  {createMutation.isPending ? "adding…" : "add model"}
                </Button>
              </div>
            )}

            {modelsQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-lg bg-surface/40 animate-pulse" />
                ))}
              </div>
            ) : !modelsQuery.data?.length ? (
              <p className="text-sm text-muted-foreground/50 py-4">No models configured.</p>
            ) : (
              <div className="divide-y divide-border/30">
                {modelsQuery.data.map((m) => (
                  <ModelRow key={m.model_id} m={m} />
                ))}
              </div>
            )}
          </section>

          {/* Plan limits */}
          <section className="rounded-xl border border-border/60 bg-surface/40 p-5">
            <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
              <h2 className="text-[13px] font-semibold text-foreground font-mono">
                Plan limits
              </h2>
              <Button
                size="sm"
                disabled={planLimitsUpdateMutation.isPending || planLimitsQuery.isLoading}
                onClick={() => planLimitsUpdateMutation.mutate()}
                className="h-7 px-3 text-[11px] font-mono"
              >
                {planLimitsUpdateMutation.isPending ? "saving…" : "save"}
              </Button>
            </div>

            {planLimitsQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-lg bg-surface/40 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(planLimitsQuery.data ?? []).map((r) => {
                  const draft = { ...r, ...(planEdits[r.plan_tier] ?? {}) };
                  const updateNum = (
                    key: "monthly_token_limit" | "max_documents" | "max_corpora" | "max_members"
                  ) => (value: string) => {
                      const trimmed = value.trim();
                      const nextVal =
                        trimmed === "" ? null : Number(trimmed);
                      setPlanEdits((p) => ({
                        ...p,
                        [r.plan_tier]: {
                          ...(p[r.plan_tier] ?? {}),
                          [key]: nextVal,
                        },
                      }));
                    };
                  return (
                    <div key={r.plan_tier} className="rounded-lg border border-border/40 p-3">
                      <div className="text-sm font-semibold font-mono mb-2">
                        {r.plan_tier}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-muted-foreground font-mono block mb-1">
                            monthly_token_limit
                          </label>
                          <input
                            type="number"
                            value={draft.monthly_token_limit ?? ""}
                            onChange={(e) => updateNum("monthly_token_limit")(e.target.value)}
                            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-mono block mb-1">
                            max_documents
                          </label>
                          <input
                            type="number"
                            value={draft.max_documents ?? ""}
                            onChange={(e) => updateNum("max_documents")(e.target.value)}
                            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-mono block mb-1">
                            max_corpora
                          </label>
                          <input
                            type="number"
                            value={draft.max_corpora ?? ""}
                            onChange={(e) => updateNum("max_corpora")(e.target.value)}
                            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-mono block mb-1">
                            max_members
                          </label>
                          <input
                            type="number"
                            value={draft.max_members ?? ""}
                            onChange={(e) => updateNum("max_members")(e.target.value)}
                            className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!planLimitsQuery.data || planLimitsQuery.data.length === 0) && (
                  <p className="text-sm text-muted-foreground/50">No plan limits configured.</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
