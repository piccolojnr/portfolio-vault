"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getSettings,
  updateSettings,
  type SettingsRead,
  type SettingsUpdate,
} from "@/lib/settings";

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-foreground font-mono border-b border-border/40 pb-2 mb-4">
      {children}
    </h2>
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
      <label className="w-40 shrink-0 text-[12px] font-mono text-muted-foreground">
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

// ── API key row ────────────────────────────────────────────────────────────────

function ApiKeyRow({
  label,
  isSet,
  onSave,
  saving,
}: {
  label: string;
  isSet: boolean;
  onSave: (value: string) => Promise<void>;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setErr(null);
    try {
      await onSave(value);
      setEditing(false);
      setValue("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleClear() {
    setErr(null);
    try {
      await onSave("");
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <FieldRow label={label}>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-…"
            autoFocus
            className="flex-1 min-w-0 bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !value}
            className="h-7 px-3 text-[11px] font-mono"
          >
            {saving ? "…" : "save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setValue("");
            }}
            className="h-7 px-2 text-[11px] font-mono"
          >
            cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span
            className={`text-[11px] font-mono ${isSet ? "text-green-400" : "text-muted-foreground/50"}`}
          >
            {isSet ? "● set" : "○ not set"}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors underline underline-offset-2"
          >
            {isSet ? "update" : "set"}
          </button>
          {isSet && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="text-[11px] font-mono text-muted-foreground/40 hover:text-destructive transition-colors"
            >
              clear
            </button>
          )}
        </div>
      )}
      {err && (
        <p className="mt-1 text-[11px] text-destructive font-mono">{err}</p>
      )}
    </FieldRow>
  );
}

// ── Dropdown row ───────────────────────────────────────────────────────────────

function SelectRow({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <FieldRow label={label} hint={hint}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40 appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [data, setData] = useState<SettingsRead | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  // Local draft for model/limit fields
  const [draft, setDraft] = useState<{
    embedding_model: string;
    anthropic_model: string;
    openai_model: string;
    cost_limit_usd: string;
  } | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setData(s);
        setDraft({
          embedding_model: s.embedding_model,
          anthropic_model: s.anthropic_model,
          openai_model: s.openai_model,
          cost_limit_usd:
            s.cost_limit_usd === 0 ? "" : String(s.cost_limit_usd),
        });
      })
      .catch((e) => setLoadErr(e.message));
  }, []);

  const applyUpdate = useCallback(async (patch: SettingsUpdate) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateSettings(patch);
      setData(updated);
      setDraft({
        embedding_model: updated.embedding_model,
        anthropic_model: updated.anthropic_model,
        openai_model: updated.openai_model,
        cost_limit_usd:
          updated.cost_limit_usd === 0 ? "" : String(updated.cost_limit_usd),
      });
      setSaveMsg({ text: "Saved", ok: true });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setSaveMsg({
        text: e instanceof Error ? e.message : "Failed",
        ok: false,
      });
    } finally {
      setSaving(false);
    }
  }, []);

  const saveModels = useCallback(async () => {
    if (!draft) return;
    await applyUpdate({
      embedding_model: draft.embedding_model,
      anthropic_model: draft.anthropic_model,
      openai_model: draft.openai_model,
      cost_limit_usd: draft.cost_limit_usd
        ? parseFloat(draft.cost_limit_usd)
        : 0,
    });
  }, [draft, applyUpdate]);

  if (loadErr) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[13px] text-destructive font-mono">{loadErr}</p>
      </div>
    );
  }

  if (!data || !draft) {
    return (
      <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-8">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl bg-muted/20"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Settings
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              API keys and model configuration. Keys are encrypted before
              storage.
            </p>
          </div>

          {/* API Keys */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>API Keys</SectionHeading>
            <div className="divide-y divide-border/30">
              <ApiKeyRow
                label="OpenAI"
                isSet={data.openai_api_key_set}
                saving={saving}
                onSave={(v) => applyUpdate({ openai_api_key: v })}
              />
              <ApiKeyRow
                label="Anthropic"
                isSet={data.anthropic_api_key_set}
                saving={saving}
                onSave={(v) => applyUpdate({ anthropic_api_key: v })}
              />
            </div>
          </section>

          {/* Models */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>Models</SectionHeading>
            <div className="divide-y divide-border/30">
              <SelectRow
                label="Embedding"
                value={draft.embedding_model}
                options={data.embedding_model_options}
                onChange={(v) =>
                  setDraft((d) => d && { ...d, embedding_model: v })
                }
                hint="used at index time"
              />
              <SelectRow
                label="Anthropic gen."
                value={draft.anthropic_model}
                options={data.anthropic_model_options}
                onChange={(v) =>
                  setDraft((d) => d && { ...d, anthropic_model: v })
                }
                hint="used when Anthropic key is set"
              />
              <SelectRow
                label="OpenAI gen."
                value={draft.openai_model}
                options={data.openai_model_options}
                onChange={(v) => setDraft((d) => d && { ...d, openai_model: v })}
                hint="fallback if no Anthropic key"
              />
            </div>
          </section>

          {/* Cost limits */}
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <SectionHeading>Cost limits</SectionHeading>
            <FieldRow label="Pipeline limit" hint="0 = no limit">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-mono text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.cost_limit_usd}
                  onChange={(e) =>
                    setDraft((d) => d && {
                      ...d,
                      cost_limit_usd: e.target.value,
                    })
                  }
                  placeholder="0.00"
                  className="w-28 bg-surface border border-border rounded-md px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <span className="text-[11px] font-mono text-muted-foreground/60">
                  USD per run
                </span>
              </div>
            </FieldRow>
          </section>

          {/* Save models + limits */}
          <div className="flex items-center gap-3 pb-4">
            <Button
              onClick={saveModels}
              disabled={saving}
              className="h-8 px-4 font-mono text-[12px]"
            >
              {saving ? "saving…" : "save model settings"}
            </Button>
            {saveMsg && (
              <span
                className={`text-[12px] font-mono ${saveMsg.ok ? "text-green-400" : "text-destructive"}`}
              >
                {saveMsg.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
