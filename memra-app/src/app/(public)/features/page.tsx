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
      title="Features for grounded team workflows"
      subtitle="Use document indexing, retrieval, and operations controls designed for reliable day-to-day knowledge work."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
              Feature map
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Capabilities designed for operational teams
            </h2>
            <p className="text-sm text-muted-foreground mt-3">
              These are practical capabilities reflected in existing platform architecture and
              deployment documentation.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            {["Chat", "Indexing", "Retrieval", "Ops", "Governance", "Usage"].map((item) => (
              <div key={item} className="rounded-lg border border-border/50 bg-bg/40 p-2.5 text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="grid md:grid-cols-2 gap-4">
        {[
          [
            "Grounded AI chat",
            "Question-answering workflows are tied to indexed document context instead of ungrounded generation alone.",
          ],
          [
            "Document indexing pipeline",
            "Chunking, embedding, and storage stages support repeatable ingestion for growing knowledge bases.",
          ],
          [
            "Hybrid retrieval paths",
            "Vector and graph-aware retrieval patterns improve context quality across different question types.",
          ],
          [
            "Workspace operations",
            "Team-oriented access patterns support shared use while preserving role boundaries.",
          ],
          [
            "Observability controls",
            "Health and diagnostics coverage helps admins verify key dependencies and runtime status.",
          ],
          [
            "Usage and policy visibility",
            "Billing and plan policies are surfaced so teams can operate within clear constraints.",
          ],
        ].map(([title, desc]) => (
          <article key={title} className="rounded-xl border border-border bg-surface/40 p-5">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-2">{desc}</p>
          </article>
        ))}
      </section>
    </PublicShell>
  );
}
