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
      subtitle="Reference docs for setup, deployment, billing policies, and day-to-day operations."
    >
      <JsonLd data={breadcrumbLd} />
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
      <div className="mt-6">
        <Link href="/contact" className="text-sm text-primary hover:underline">
          Need help with implementation? Contact sales and support.
        </Link>
      </div>
    </PublicShell>
  );
}
