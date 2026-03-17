"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDocument } from "@/lib/documents";
import { Button } from "@/components/ui/button";

const PRESET_TYPES = ["bio", "skills", "experience", "brag", "project"];

function toSlug(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function NewDocumentPage() {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle]           = useState("");
  const [slug, setSlug]             = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [type, setType]             = useState("project");
  const [customType, setCustomType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugEdited) setSlug(toSlug(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalType = type === "_custom" ? customType.trim() : type;
    if (!slug || !title || !finalType) return;
    setSubmitting(true);
    setError(null);
    try {
      const doc = await createDocument({ slug, title, type: finalType });
      router.push(`/documents/${doc.slug}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-5 border-b border-border/40">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Documents
        </Link>
        <h1 className="text-base font-semibold text-foreground">New Document</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Create a text document. You&apos;ll be taken to the editor after creation.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="max-w-md space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Title <span className="text-muted-foreground/40">(required)</span>
            </label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Side Project: Payments API"
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/30"
              required
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Slug <span className="text-muted-foreground/40">(auto-derived from title)</span>
            </label>
            <input
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
              placeholder="payments-api"
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/30"
              required
            />
            <p className="text-[11px] text-muted-foreground/50 mt-1.5">
              Used as the URL identifier. Must be unique.
            </p>
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Type</label>
            <div className="flex gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="flex-1 bg-bg border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors"
              >
                {PRESET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="_custom">custom…</option>
              </select>
              {type === "_custom" && (
                <input
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  placeholder="type name"
                  className="w-36 bg-bg border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-colors placeholder:text-muted-foreground/30"
                  required
                  autoFocus
                />
              )}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={submitting || !title || !slug}>
              {submitting ? "Creating…" : "Create & open editor"}
            </Button>
            <Link href="/documents">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
