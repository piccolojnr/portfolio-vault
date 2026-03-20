import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, APP_URL } from "@/lib/env";
import { JsonLd } from "./_components/json-ld";
import { PublicShell } from "./_components/public-shell";

export const metadata: Metadata = {
  title: "AI Knowledge Workspace",
  description:
    "Turn team documents into a searchable, conversational workspace with grounded AI answers.",
  alternates: { canonical: "/" },
  openGraph: {
    title: `${APP_NAME} | AI Knowledge Workspace`,
    description:
      "Upload docs, search instantly, and chat with grounded answers in one secure workspace.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} | AI Knowledge Workspace`,
    description:
      "Upload docs, search instantly, and chat with grounded answers in one secure workspace.",
  },
};

export default function LandingPage() {
  const pillars = [
    {
      label: "Grounded Chat",
      description:
        "Ask questions in natural language and get answers grounded in indexed documents instead of generic model output.",
    },
    {
      label: "Document Pipeline",
      description:
        "Move from raw docs to chunked, embedded, and searchable knowledge with retrieval designed for operational use.",
    },
    {
      label: "Operational Visibility",
      description:
        "Track health, limits, and billing behavior with explicit diagnostics across key platform dependencies.",
    },
    {
      label: "Team Controls",
      description:
        "Use team workspaces and role-based boundaries so knowledge workflows can scale across real organizations.",
    },
  ];

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: APP_NAME,
    url: APP_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${APP_URL}/app`,
      "query-input": "required name=search_term_string",
    },
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: APP_NAME,
    url: APP_URL,
    logo: `${APP_URL}/logos/memraiq-icon-512.png`,
  };

  return (
    <PublicShell
      title="Knowledge work that stays grounded"
      subtitle={`${APP_NAME} helps teams index internal documents, retrieve the right context, and answer questions with traceable confidence.`}
    >
      <JsonLd data={websiteJsonLd} />
      <JsonLd data={orgJsonLd} />

      <section className="rounded-2xl border border-border bg-surface/40 p-6 sm:p-8">
        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
          <div className="flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-3">
                Trusted retrieval workflows
              </p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-tight">
                From scattered docs to grounded team answers
              </h2>
              <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-xl">
                Use a single workspace for document ingestion, context retrieval, and
                source-aware responses your team can actually validate.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={`${APP_URL}/register`}
                className="inline-block text-[13px] font-mono px-5 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                start free
              </a>
              <Link
                href="/pricing"
                className="inline-block text-[13px] font-mono px-5 py-2.5 rounded-md border border-border text-foreground hover:bg-surface/60 transition-colors"
              >
                compare plans
              </Link>
              <Link
                href="/legal"
                className="inline-block text-[13px] font-mono px-5 py-2.5 rounded-md border border-border text-foreground hover:bg-surface/60 transition-colors"
              >
                review legal
              </Link>
            </div>
          </div>

          <aside className="rounded-xl border border-border/60 bg-bg/60 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Platform snapshot</h3>
            <div className="space-y-3">
              <article className="rounded-lg border border-border/50 bg-surface/50 p-3">
                <p className="text-[11px] font-mono text-primary/70 uppercase tracking-wider">
                  Ingestion
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Chunk and index operational documents for consistent retrieval performance.
                </p>
              </article>
              <article className="rounded-lg border border-border/50 bg-surface/50 p-3">
                <p className="text-[11px] font-mono text-primary/70 uppercase tracking-wider">
                  Retrieval
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Blend vector and graph-aware context paths for better question coverage.
                </p>
              </article>
              <article className="rounded-lg border border-border/50 bg-surface/50 p-3">
                <p className="text-[11px] font-mono text-primary/70 uppercase tracking-wider">
                  Operations
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Monitor health, limits, and policy behavior with admin diagnostics.
                </p>
              </article>
            </div>
          </aside>
        </div>
      </section>

      <section className="mt-12 grid lg:grid-cols-4 gap-4">
        {pillars.map((f, i) => (
          <div
            key={f.label}
            className="p-5 rounded-lg border border-border/60 bg-surface/40"
          >
            <span className="block text-[11px] font-mono text-primary/60 mb-2 tracking-widest uppercase">
              0{i + 1}
            </span>
            <h2 className="text-sm font-semibold text-foreground mb-1.5 tracking-tight">
              {f.label}
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {f.description}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-12 rounded-xl border border-border bg-surface/40 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">How teams use it</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-border/50 p-3">
            <p className="font-mono text-primary text-xs mb-1">01</p>
            <p className="text-muted-foreground">
              Ingest documents from operational workflows into a single workspace.
            </p>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <p className="font-mono text-primary text-xs mb-1">02</p>
            <p className="text-muted-foreground">
              Build retrieval context with vector and graph-aware infrastructure.
            </p>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <p className="font-mono text-primary text-xs mb-1">03</p>
            <p className="text-muted-foreground">
              Answer team questions with grounded responses and source context.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-border bg-surface/40 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Built for practical operations
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {[
            "Hybrid retrieval patterns across vector and graph backends.",
            "Background workers for indexing so web traffic remains responsive.",
            "Settings and model controls designed for runtime adjustment.",
            "Pipeline and health endpoints for admin-level observability.",
            "Workspace-centric design for document governance and access.",
            "Export and integration pathways for downstream team workflows.",
          ].map((item) => (
            <article
              key={item}
              className="rounded-lg border border-border/50 p-3 text-muted-foreground"
            >
              {item}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-border bg-surface/40 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">Explore by page</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["/pricing", "Pricing"],
            ["/features", "Features"],
            ["/security", "Security"],
            ["/integrations", "Integrations"],
            ["/docs", "Docs"],
            ["/blog", "Blog"],
            ["/about", "About"],
            ["/contact", "Contact sales"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-border/50 p-3 text-sm text-muted-foreground hover:text-foreground hover:bg-surface/60 transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-border bg-surface/40 p-6 text-center">
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
          Start with your current docs
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Begin in free mode, then grow into advanced governance and support as your team
          scales.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`${APP_URL}/register`}
            className="inline-block text-[13px] font-mono px-6 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            start free
          </a>
          <Link
            href="/contact"
            className="inline-block text-[13px] font-mono px-6 py-2.5 rounded-md border border-border text-foreground hover:bg-surface/60 transition-colors"
          >
            contact sales
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
