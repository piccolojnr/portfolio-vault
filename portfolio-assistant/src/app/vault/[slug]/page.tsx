"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getDocument, updateDocument, type VaultDocDetail } from "@/lib/vault";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Avoid SSR for MDEditor (it relies on browser APIs)
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

const TYPE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  project: "default",
  brag: "secondary",
  bio: "outline",
  skills: "outline",
  experience: "outline",
};

export default function VaultEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [doc, setDoc] = useState<VaultDocDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const saveMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getDocument(slug)
      .then((d) => {
        setDoc(d);
        setTitle(d.title);
        setContent(d.content);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [slug]);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    setDirty(true);
    setSaveMsg(null);
  }

  function handleContentChange(value: string | undefined) {
    setContent(value ?? "");
    setDirty(true);
    setSaveMsg(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateDocument(slug, { title, content });
      setDoc(updated);
      setDirty(false);
      setSaveMsg("Saved");
      if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
      saveMsgTimer.current = setTimeout(() => setSaveMsg(null), 3000);
    } catch (e: unknown) {
      setSaveMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-destructive">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="bg-bg text-foreground flex flex-col" style={{ minHeight: "calc(100vh - 61px)" }}>
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link
          href="/vault"
          className="text-muted-foreground hover:text-foreground text-sm transition-colors shrink-0"
        >
          ← Vault
        </Link>

        {doc ? (
          <>
            <input
              value={title}
              onChange={handleTitleChange}
              className="flex-1 bg-transparent text-lg font-semibold focus:outline-none border-b border-transparent focus:border-border transition-colors min-w-0"
              placeholder="Document title"
            />
            <Badge variant={TYPE_VARIANT[doc.type] ?? "outline"} className="shrink-0">
              {doc.type}
            </Badge>
          </>
        ) : (
          <div className="flex-1 h-6 rounded bg-surface animate-pulse" />
        )}
      </header>

      {/* Editor */}
      <main className="flex-1 px-6 py-6">
        {doc !== null && (
          <div data-color-mode="dark">
            <MDEditor
              value={content}
              onChange={handleContentChange}
              height={500}
              preview="live"
            />
          </div>
        )}
        {doc === null && !loadError && (
          <div className="h-[500px] rounded-md bg-surface animate-pulse" />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 flex items-center gap-4">
        <Button onClick={handleSave} disabled={saving || !doc} size="sm">
          {saving ? "Saving…" : "Save"}
        </Button>

        {dirty && !saveMsg && (
          <span className="text-muted-foreground text-sm">● Unsaved changes</span>
        )}
        {saveMsg && (
          <span
            className={`text-sm ${saveMsg.startsWith("Error") ? "text-destructive" : "text-green-400"}`}
          >
            {saveMsg}
          </span>
        )}
      </footer>
    </div>
  );
}
