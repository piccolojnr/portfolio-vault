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
      subtitle="Track platform updates, feature releases, and operational guidance."
    >
      <JsonLd data={collectionLd} />
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
