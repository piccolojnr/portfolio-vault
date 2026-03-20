import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../_components/json-ld";
import { PublicShell } from "../_components/public-shell";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Get started quickly with setup, deployment, billing, and operations guides for Memra.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: `${APP_NAME} Docs`,
    description: "Documentation hub for deployment, usage, and platform administration.",
    url: "/docs",
    type: "website",
  },
};

export default function DocsPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Docs", item: "/docs" },
    ],
  };

  return (
    <PublicShell
      title="Documentation and guides"
      subtitle="Use implementation guides for setup, deployment, operations, and policy-aware platform usage."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
              Docs entry point
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Implementation-first documentation
            </h2>
            <p className="text-sm text-muted-foreground mt-3">
              Start with setup and deployment, then move into operations and billing policy guidance.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {["Quickstart", "Deployment", "Billing", "Operations"].map((item) => (
              <div key={item} className="rounded-lg border border-border/50 bg-bg/40 p-3 text-muted-foreground text-center">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="grid md:grid-cols-2 gap-4">
        {[
          ["Quickstart", "Set up your first workspace and upload documents."],
          ["Deployment", "Configure Supabase, Qdrant, Neo4j, workers, and billing."],
          ["Billing policies", "Understand token windows, limits, and downgrade behavior."],
          ["Admin operations", "Health checks, diagnostics, and monitoring workflows."],
        ].map(([name, desc]) => (
          <article key={name} className="rounded-xl border border-border bg-surface/40 p-5">
            <h2 className="font-semibold">{name}</h2>
            <p className="text-sm text-muted-foreground mt-2">{desc}</p>
          </article>
        ))}
      </section>
      <section className="mt-8 rounded-xl border border-border bg-surface/40 p-6 text-sm text-muted-foreground space-y-2">
        <p>
          Documentation is focused on practical operator workflows: from first setup to live
          diagnostics and policy handling.
        </p>
        <p>TODO(docs): add direct links to route-level references and API examples.</p>
      </section>
      <div className="mt-6">
        <Link href="/contact" className="text-sm text-primary hover:underline">
          Need help with implementation? Contact sales and support.
        </Link>
      </div>
    </PublicShell>
  );
}
