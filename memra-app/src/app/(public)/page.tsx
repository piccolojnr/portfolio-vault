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
  const features = [
    {
      label: "AI-Powered Chat",
      description:
        "Converse with your documents using natural language. Ask questions, extract insights, and get cited answers grounded in your knowledge base.",
    },
    {
      label: "Document Vault",
      description:
        "Upload, organize, and manage documents with automatic chunking, embedding, and full-text search. Your knowledge, structured and searchable.",
    },
    {
      label: "Knowledge Graph",
      description:
        "Visualize relationships between concepts, entities, and documents. Discover hidden connections across your entire knowledge base.",
    },
    {
      label: "Team Workspaces",
      description:
        "Collaborate across organisations with role-based access, shared document vaults, and unified conversation histories.",
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
      title="Your documents, understood."
      subtitle={`${APP_NAME} transforms company documents into a searchable, conversational knowledge workspace with grounded answers.`}
    >
      <JsonLd data={websiteJsonLd} />
      <JsonLd data={orgJsonLd} />

      <section className="grid lg:grid-cols-3 gap-4">
        {features.map((f, i) => (
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
        <h2 className="text-lg font-semibold text-foreground mb-3">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-border/50 p-3">
            <p className="font-mono text-primary text-xs mb-1">01</p>
            <p className="text-muted-foreground">Upload documents and team knowledge.</p>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <p className="font-mono text-primary text-xs mb-1">02</p>
            <p className="text-muted-foreground">Memra indexes and connects concepts automatically.</p>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <p className="font-mono text-primary text-xs mb-1">03</p>
            <p className="text-muted-foreground">Ask questions and get grounded, cited answers.</p>
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-border bg-surface/40 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">Explore more</h2>
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
          Ready to unlock your knowledge?
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Create an account and start building your AI workspace in minutes.
        </p>
        <a
          href={`${APP_URL}/register`}
          className="inline-block mt-4 text-[13px] font-mono px-6 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          start free
        </a>
      </section>
    </PublicShell>
  );
}
