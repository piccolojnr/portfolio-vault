"use client";

import dynamic from "next/dynamic";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDocument, updateDocument, deleteDocument, type CorpusDocDetail } from "@/lib/documents";
import { reIngestDocument } from "@/lib/ingest";
import { Button } from "@/components/ui/button";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

export default function DocumentEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();

  const [doc, setDoc]           = useState<CorpusDocDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle]       = useState("");
  const [content, setContent]   = useState("");
  const [dirty, setDirty]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState<{ text: string; ok: boolean } | null>(null);
  const saveMsgTimer            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoReingest, setAutoReingest] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getDocument(slug)
      .then((d) => { setDoc(d); setTitle(d.title); setContent(d.extracted_text); })
      .catch((e: Error) => setLoadError(e.message));
  }, [slug]);

  const handleSave = useCallback(async () => {
    if (!doc || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateDocument(slug, { title, extracted_text: content });
      setDoc(updated);
      setDirty(false);
      if (autoReingest) {
        setSaveMsg({ text: "Saved · re-ingesting…", ok: true });
        reIngestDocument(doc.id).catch(() => {});
      } else {
        setSaveMsg({ text: "Saved", ok: true });
      }
      if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
      saveMsgTimer.current = setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) {
      setSaveMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  }, [doc, saving, slug, title, content, autoReingest]);

  // Cmd/Ctrl+S
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteDocument(slug);
      router.push("/documents");
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
          <Button variant="ghost" size="sm" onClick={() => router.push(`/documents/${slug}`)}>
            ← Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border px-4 sm:px-5 py-2.5 flex items-center gap-2 sm:gap-3">
        {/* Breadcrumb */}
        <Link
          href={`/documents/${slug}`}
          className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors shrink-0 flex items-center gap-1"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {doc?.title || slug}
        </Link>

        <span className="text-border/60 text-xs shrink-0">/</span>
        <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0">edit</span>

        <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Auto re-ingest toggle */}
          <label
            className="hidden sm:flex items-center gap-1.5 cursor-pointer select-none"
            title="Re-ingest into knowledge graph after saving"
          >
            <div
              role="switch"
              aria-checked={autoReingest}
              onClick={() => setAutoReingest((v) => !v)}
              className={`relative w-7 h-4 rounded-full transition-colors ${autoReingest ? "bg-primary" : "bg-muted/60"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${autoReingest ? "translate-x-3" : ""}`} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/60">auto-ingest</span>
          </label>

          {/* Save state */}
          {dirty && !saveMsg && (
            <span className="hidden sm:block text-[11px] text-muted-foreground/60 font-mono">unsaved</span>
          )}
          {saveMsg && (
            <span className={`text-[11px] font-mono ${saveMsg.ok ? "text-green-400" : "text-destructive"}`}>
              {saveMsg.text}
            </span>
          )}

          <Button onClick={handleSave} disabled={saving || !doc} size="sm" variant={dirty ? "default" : "outline"}>
            {saving ? "Saving…" : "Save"}
          </Button>

          {/* Delete */}
          {deleteConfirm ? (
            <span className="flex items-center gap-1">
              <Button onClick={handleDelete} disabled={deleting} size="sm" variant="destructive">
                {deleting ? "…" : "Delete"}
              </Button>
              <Button onClick={() => setDeleteConfirm(false)} size="sm" variant="ghost">✕</Button>
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

      {/* Editor */}
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
