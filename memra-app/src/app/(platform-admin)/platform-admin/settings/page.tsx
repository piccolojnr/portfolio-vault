"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/platform-admin/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

  return (
    <div className="flex items-start gap-4 border-b border-neutral-800 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-neutral-200">{s.key}</p>
        {s.description && (
          <p className="text-[11px] text-neutral-500 mt-0.5">{s.description}</p>
        )}
        <div className="mt-2">
          {editing ? (
            <Input
              type={s.is_secret ? "password" : "text"}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={s.is_secret && s.has_value ? "••••••••" : ""}
              className="h-7 text-[12px] bg-neutral-900 border-neutral-700 max-w-md"
            />
          ) : (
            <span
              className={`text-[12px] font-mono ${
                revealedValue !== null ? "text-amber-400" : "text-neutral-400"
              }`}
            >
              {displayValue || "—"}
            </span>
          )}
        </div>
        <p className="text-[10px] text-neutral-600 mt-1">
          Last updated: {formatDaysAgo(s.updated_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {editing ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              className="h-7 text-[11px] border-neutral-700"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(editValue)}
              disabled={saveMutation.isPending}
              className="h-7 text-[11px]"
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
              className="h-7 text-[11px] text-neutral-400 hover:text-neutral-200"
            >
              Edit
            </Button>
            {s.is_secret && s.has_value && (
              <Button
                size="sm"
                variant="ghost"
                onClick={reveal}
                className="h-7 text-[11px] text-neutral-400 hover:text-neutral-200"
              >
                Reveal
              </Button>
            )}
          </>
        )}
      </div>
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
    <tr className="border-b border-neutral-800/50 last:border-b-0">
      <td className="py-2 pr-4 text-[12px] text-neutral-200">{m.model_name}</td>
      <td className="py-2 pr-4 text-[12px] text-neutral-400 font-mono">
        {m.provider}
      </td>
      <td className="py-2 pr-4 text-[12px] text-neutral-400">{m.model_type}</td>
      <td className="py-2 pr-4">
        <Select
          value={m.min_plan}
          onValueChange={(v) => updateMutation.mutate({ min_plan: v ?? undefined })}
        >
          <SelectTrigger
            className="h-7 min-w-[100px] text-[11px] border-neutral-700 bg-neutral-900"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="free">free</SelectItem>
            <SelectItem value="pro">pro</SelectItem>
            <SelectItem value="enterprise">enterprise</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="py-2">
        <Switch
          checked={m.enabled}
          onCheckedChange={(v) => updateMutation.mutate({ enabled: v })}
          size="sm"
        />
      </td>
    </tr>
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
    <div className="min-h-screen bg-[#0f0f0f] text-neutral-200 p-6">
      <h1 className="text-lg font-medium text-neutral-200 mb-6">Settings</h1>

      <div className="space-y-6">
        {/* API Keys */}
        <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
          <h2 className="text-[13px] font-medium text-neutral-300 mb-3">
            API Keys
          </h2>
          {settingsQuery.isLoading ? (
            <p className="text-neutral-500 text-[12px]">Loading...</p>
          ) : !settingsQuery.data?.length ? (
            <p className="text-neutral-500 text-[12px]">No settings</p>
          ) : (
            <div className="divide-y-0">
              {settingsQuery.data.map((s) => (
                <SettingRow key={s.key} s={s} />
              ))}
            </div>
          )}
        </div>

        {/* Model Configuration */}
        <div className="bg-[#141414] border border-neutral-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-medium text-neutral-300">
              Model Configuration
            </h2>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger render={         <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-neutral-700"
                >
                  Add Model
                </Button>} />
       
              <DialogContent className="bg-[#141414] border-neutral-800 text-neutral-200 max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-neutral-200">
                    Add Model
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div>
                    <label className="text-[11px] text-neutral-500 block mb-1">
                      Model ID
                    </label>
                    <Input
                      value={newModel.model_id}
                      onChange={(e) =>
                        setNewModel((p) => ({ ...p, model_id: e.target.value }))
                      }
                      placeholder="e.g. gpt-4"
                      className="h-7 text-[12px] bg-neutral-900 border-neutral-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 block mb-1">
                      Model Name
                    </label>
                    <Input
                      value={newModel.model_name}
                      onChange={(e) =>
                        setNewModel((p) => ({ ...p, model_name: e.target.value }))
                      }
                      placeholder="e.g. GPT-4"
                      className="h-7 text-[12px] bg-neutral-900 border-neutral-700"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 block mb-1">
                      Model Type
                    </label>
                    <Select
                      value={newModel.model_type}
                      onValueChange={(v) =>
                        setNewModel((p) => ({ ...p, model_type: v ?? "" }))
                      }
                    >
                      <SelectTrigger
                        className="h-7 text-[12px] border-neutral-700 bg-neutral-900"
                        size="sm"
                      >
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
                    <label className="text-[11px] text-neutral-500 block mb-1">
                      Provider
                    </label>
                    <Select
                      value={newModel.provider}
                      onValueChange={(v) =>
                        setNewModel((p) => ({ ...p, provider: v ?? "" }))
                      }
                    >
                      <SelectTrigger
                        className="h-7 text-[12px] border-neutral-700 bg-neutral-900"
                        size="sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anthropic">anthropic</SelectItem>
                        <SelectItem value="openai">openai</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-500 block mb-1">
                      Min Plan
                    </label>
                    <Select
                      value={newModel.min_plan}
                      onValueChange={(v) =>
                        setNewModel((p) => ({ ...p, min_plan: v ?? "free" }))
                      }
                    >
                      <SelectTrigger
                        className="h-7 text-[12px] border-neutral-700 bg-neutral-900"
                        size="sm"
                      >
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
                <DialogFooter className="border-t border-neutral-800 pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddOpen(false)}
                    className="text-neutral-400"
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
            <p className="text-neutral-500 text-[12px]">Loading...</p>
          ) : !modelsQuery.data?.length ? (
            <p className="text-neutral-500 text-[12px]">No models</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800">
                    <th className="text-left py-2 pr-4 text-neutral-500 font-medium">
                      Model Name
                    </th>
                    <th className="text-left py-2 pr-4 text-neutral-500 font-medium">
                      Provider
                    </th>
                    <th className="text-left py-2 pr-4 text-neutral-500 font-medium">
                      Type
                    </th>
                    <th className="text-left py-2 pr-4 text-neutral-500 font-medium">
                      Min Plan
                    </th>
                    <th className="text-left py-2 text-neutral-500 font-medium">
                      Enabled
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {modelsQuery.data.map((m) => (
                    <ModelRow key={m.model_id} m={m} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
