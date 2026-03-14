"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getDocument, updateDocument, deleteDocument, triggerReindex, type VaultDocDetail } from "@/lib/vault";
import { Button } from "@/components/ui/button";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

const TYPE_COLORS: Record<string, string> = {
  project: "bg-primary/15 text-primary border-primary/20",
  bio: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  skills: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  experience: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  brag: "bg-green-500/10 text-green-400 border-green-500/20",
};

function TypePill({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] ?? "bg-muted/40 text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium ${cls}`}>
      {type}
    </span>
  );
}

export default function VaultEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();

  const [doc, setDoc] = useState<VaultDocDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const saveMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoReindex, setAutoReindex] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getDocument(slug)
      .then((d) => { setDoc(d); setTitle(d.title); setContent(d.content); })
      .catch((e: Error) => setLoadError(e.message));
  }, [slug]);

  const handleSave = useCallback(async () => {
    if (!doc || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateDocument(slug, { title, content });
      setDoc(updated);
      setDirty(false);
      if (autoReindex) {
        setSaveMsg({ text: "Saved · reindexing…", ok: true });
        triggerReindex().catch(() => {});
      } else {
        setSaveMsg({ text: "Saved", ok: true });
      }
      if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
      saveMsgTimer.current = setTimeout(() => setSaveMsg(null), 3000);
    } catch (e: unknown) {
      setSaveMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  }, [doc, saving, slug, title, content]);

  // Cmd/Ctrl+S to save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteDocument(slug);
      router.push("/vault");
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-destructive text-sm">{loadError}</p>
          <Button variant="ghost" size="sm" onClick={() => router.push("/vault")}>
            ← Back to vault
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border px-5 py-2.5 flex items-center gap-3">
        <button
          onClick={() => router.push("/vault")}
          className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0 flex items-center gap-1"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          vault
        </button>

        <span className="text-border/60 text-xs">/</span>

        <span className="text-[12px] font-mono text-muted-foreground truncate">
          {slug}
        </span>

        {doc && <TypePill type={doc.type} />}

        <div className="ml-auto flex items-center gap-3">
          {/* Auto-reindex toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Automatically re-index after saving">
            <div
              role="switch"
              aria-checked={autoReindex}
              onClick={() => setAutoReindex((v) => !v)}
              className={`relative w-7 h-4 rounded-full transition-colors ${autoReindex ? "bg-primary" : "bg-muted/60"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${autoReindex ? "translate-x-3" : ""}`}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/60">auto-index</span>
          </label>

          {/* Save status */}
          {dirty && !saveMsg && (
            <span className="text-[11px] text-muted-foreground/60 font-mono hidden sm:block">
              unsaved
            </span>
          )}
          {saveMsg && (
            <span className={`text-[11px] font-mono ${saveMsg.ok ? "text-green-400" : "text-destructive"}`}>
              {saveMsg.text}
            </span>
          )}

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={saving || !doc}
            size="sm"
            variant={dirty ? "default" : "outline"}
          >
            {saving ? "Saving…" : "Save"}
          </Button>

          {/* Delete */}
          {deleteConfirm ? (
            <span className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Delete?</span>
              <Button
                onClick={handleDelete}
                disabled={deleting}
                size="sm"
                variant="destructive"
              >
                {deleting ? "…" : "Confirm"}
              </Button>
              <Button
                onClick={() => setDeleteConfirm(false)}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
            </span>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              title="Delete document"
              className="p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="shrink-0 px-6 pt-5 pb-3">
        {doc ? (
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); setSaveMsg(null); }}
            placeholder="Document title"
            className="w-full bg-transparent text-2xl font-semibold tracking-tight focus:outline-none placeholder:text-muted-foreground/30"
          />
        ) : (
          <div className="h-8 w-64 rounded bg-surface animate-pulse" />
        )}
      </div>

      {/* Editor — fills remaining height */}
      <div className="flex-1 overflow-hidden px-6 pb-4" data-color-mode="dark">
        {doc !== null && (
          <MDEditor
            value={content}
            onChange={(v) => { setContent(v ?? ""); setDirty(true); setSaveMsg(null); }}
            height="100%"
            preview="live"
            style={{ height: "100%" }}
          />
        )}
        {doc === null && !loadError && (
          <div className="h-full rounded-xl bg-surface animate-pulse" />
        )}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 px-6 pb-3 flex justify-end">
        <span className="text-[10px] font-mono text-muted-foreground/30">
          {typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘" : "Ctrl"}+S to save
        </span>
      </div>
    </div>
  );
}
