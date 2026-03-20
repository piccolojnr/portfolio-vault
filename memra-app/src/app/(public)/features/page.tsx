import type { Metadata } from "next";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../_components/json-ld";
import { PublicShell } from "../_components/public-shell";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore core product capabilities: AI chat over documents, graph retrieval, collaboration, and governance controls.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: `${APP_NAME} Features`,
    description:
      "AI-powered search, grounded chat, and knowledge graph features for teams.",
    url: "/features",
    type: "website",
  },
};

export default function FeaturesPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Features", item: "/features" },
    ],
  };

  return (
    <PublicShell
      title="Built for fast, grounded knowledge work"
      subtitle="Everything your team needs to index documents, reason across context, and work with trustworthy answers."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="grid md:grid-cols-2 gap-4">
        {[
          "Grounded AI chat with source-aware answers",
          "Automatic chunking, embedding, and indexing",
          "Hybrid retrieval with graph + vector context",
          "Team workspaces with role-based access",
          "Admin health dashboards and diagnostics",
          "Billing controls and usage visibility",
        ].map((item) => (
          <article key={item} className="rounded-xl border border-border bg-surface/40 p-5">
            <h2 className="text-sm font-semibold">{item}</h2>
          </article>
        ))}
      </section>
    </PublicShell>
  );
}
