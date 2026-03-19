"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

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

function formatDaysAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return "Today";
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

  const sourceBadge = s.source === "environment" ? (
    <Badge variant="outline" className="text-[9px] ml-1.5">env</Badge>
  ) : s.source === "database" ? (
    <Badge variant="secondary" className="text-[9px] ml-1.5">db</Badge>
  ) : null;

  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{s.key}</p>
          {sourceBadge}
          {s.is_secret && (
            <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30">
              secret
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(editValue)}
                disabled={saveMutation.isPending}
                className="h-7 text-xs"
              >
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={startEditing}
                className="h-7 text-xs"
              >
                Edit
              </Button>
              {s.is_secret && s.has_value && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={reveal}
                  className="h-7 text-xs"
                >
                  Reveal
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {s.description && (
        <p className="text-xs text-muted-foreground">{s.description}</p>
      )}
      <div>
        {editing ? (
          <Input
            type={s.is_secret ? "password" : "text"}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={s.is_secret && s.has_value ? "••••••••" : ""}
            className="h-8 text-sm max-w-md"
          />
        ) : (
          <span
            className={`text-sm font-mono ${
              revealedValue !== null ? "text-amber-400" : "text-muted-foreground"
            }`}
          >
            {displayValue || "—"}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        Last updated: {formatDaysAgo(s.updated_at)}
      </p>
    </div>
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

  return (
    <div className="rounded-lg border border-border p-4 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{m.model_name}</p>
          <Badge variant="outline" className="text-[10px] font-mono">
            {m.provider}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {m.model_type}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{m.model_id}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Select
          value={m.min_plan}
          onValueChange={(v) => updateMutation.mutate({ min_plan: v ?? undefined })}
        >
          <SelectTrigger className="h-7 w-24 text-xs" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="free">free</SelectItem>
            <SelectItem value="pro">pro</SelectItem>
            <SelectItem value="enterprise">enterprise</SelectItem>
          </SelectContent>
        </Select>
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
  const [newModel, setNewModel] = useState<ModelConfig>({
    model_id: "",
    model_name: "",
    model_type: "chat",
    provider: "anthropic",
    min_plan: "free",
    enabled: false,
    created_at: null,
  });

  const settingsQuery = useQuery({
    queryKey: ["platform", "settings"],
    queryFn: () => adminFetch<PlatformSetting[]>("/api/platform/settings"),
  });

  const modelsQuery = useQuery({
    queryKey: ["platform", "models"],
    queryFn: () => adminFetch<ModelConfig[]>("/api/platform/models"),
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
      setNewModel({
        model_id: "",
        model_name: "",
        model_type: "chat",
        provider: "anthropic",
        min_plan: "free",
        enabled: false,
        created_at: null,
      });
    },
  });

  const handleAddModel = () => {
    if (!newModel.model_id.trim() || !newModel.model_name.trim()) return;
    createMutation.mutate(newModel);
  };

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform configuration, API keys, and model management
        </p>
      </div>

      {/* Platform Settings */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Platform Settings</h2>
        {settingsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/20" />
            ))}
          </div>
        ) : !settingsQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">No settings configured</p>
        ) : (
          <div className="space-y-3">
            {settingsQuery.data.map((s) => (
              <SettingRow key={s.key} s={s} />
            ))}
          </div>
        )}
      </div>

      {/* Model Configuration */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Model Configuration</h2>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger render={
              <Button size="sm" variant="outline" className="h-8 text-xs">
                Add Model
              </Button>
            } />
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Add Model</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Model ID
                  </label>
                  <Input
                    value={newModel.model_id}
                    onChange={(e) =>
                      setNewModel((p) => ({ ...p, model_id: e.target.value }))
                    }
                    placeholder="e.g. gpt-4"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Model Name
                  </label>
                  <Input
                    value={newModel.model_name}
                    onChange={(e) =>
                      setNewModel((p) => ({ ...p, model_name: e.target.value }))
                    }
                    placeholder="e.g. GPT-4"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Model Type
                  </label>
                  <Select
                    value={newModel.model_type}
                    onValueChange={(v) =>
                      setNewModel((p) => ({ ...p, model_type: v ?? "" }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chat">chat</SelectItem>
                      <SelectItem value="embed">embed</SelectItem>
                      <SelectItem value="classify">classify</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Provider
                  </label>
                  <Select
                    value={newModel.provider}
                    onValueChange={(v) =>
                      setNewModel((p) => ({ ...p, provider: v ?? "" }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic">anthropic</SelectItem>
                      <SelectItem value="openai">openai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Min Plan
                  </label>
                  <Select
                    value={newModel.min_plan}
                    onValueChange={(v) =>
                      setNewModel((p) => ({ ...p, min_plan: v ?? "free" }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">free</SelectItem>
                      <SelectItem value="pro">pro</SelectItem>
                      <SelectItem value="enterprise">enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddModel}
                  disabled={
                    createMutation.isPending ||
                    !newModel.model_id.trim() ||
                    !newModel.model_name.trim()
                  }
                >
                  {createMutation.isPending ? "Adding..." : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {modelsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/20" />
            ))}
          </div>
        ) : !modelsQuery.data?.length ? (
          <p className="text-sm text-muted-foreground">No models configured</p>
        ) : (
          <div className="space-y-3">
            {modelsQuery.data.map((m) => (
              <ModelRow key={m.model_id} m={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
