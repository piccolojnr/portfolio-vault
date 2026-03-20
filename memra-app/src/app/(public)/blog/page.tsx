import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, APP_URL } from "@/lib/env";
import { JsonLd } from "../_components/json-ld";
import { PublicShell } from "../_components/public-shell";

export const metadata: Metadata = {
  title: "Blog & Changelog",
  description:
    "Product updates, release notes, and implementation guidance from the Memra team.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: `${APP_NAME} Blog & Changelog`,
    description: "Read product updates, changelog entries, and best-practice guides.",
    url: "/blog",
    type: "website",
  },
};

const entries = [
  {
    slug: "comprehensive-health-observability",
    title: "Health observability improvements",
    excerpt: "Expanded component health diagnostics across API, worker, and dependencies.",
    date: "2026-03-20",
  },
  {
    slug: "billing-policy-clarity",
    title: "Billing policy clarity update",
    excerpt: "Clarified token window resets and document cap behavior after downgrades.",
    date: "2026-03-20",
  },
];

export default function BlogPage() {
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${APP_NAME} Blog`,
    url: `${APP_URL}/blog`,
  };

  return (
    <PublicShell
      title="Blog and changelog"
      subtitle="Track platform updates, policy clarifications, and implementation guidance."
    >
      <JsonLd data={collectionLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
              Update stream
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Product and policy updates
            </h2>
            <p className="text-sm text-muted-foreground mt-3">
              Posts below are release-focused updates. Longer technical and policy guides can be
              added as this knowledge base grows.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {["Releases", "Operations", "Billing", "Guidance"].map((item) => (
              <div key={item} className="rounded-lg border border-border/50 bg-bg/40 p-3 text-center text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="space-y-3">
        {entries.map((entry) => (
          <article key={entry.slug} className="rounded-xl border border-border bg-surface/40 p-5">
            <p className="text-xs font-mono text-muted-foreground">{entry.date}</p>
            <h2 className="font-semibold mt-1">{entry.title}</h2>
            <p className="text-sm text-muted-foreground mt-2">{entry.excerpt}</p>
            <Link href="#" className="text-sm text-primary hover:underline mt-2 inline-block">
              Read post (scaffold)
            </Link>
          </article>
        ))}
      </section>
    </PublicShell>
  );
}
