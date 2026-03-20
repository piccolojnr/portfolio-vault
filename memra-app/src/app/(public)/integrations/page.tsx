import type { Metadata } from "next";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../_components/json-ld";
import { PublicShell } from "../_components/public-shell";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "See the infrastructure and model integrations that power Memra, including storage, vector, graph, and AI providers.",
  alternates: { canonical: "/integrations" },
  openGraph: {
    title: `${APP_NAME} Integrations`,
    description:
      "Integrate with your existing AI and data stack using Memra's flexible backend configuration.",
    url: "/integrations",
    type: "website",
  },
};

export default function IntegrationsPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Integrations", item: "/integrations" },
    ],
  };

  return (
    <PublicShell
      title="Integrates with your stack"
      subtitle="Connect Memra to modern AI, storage, and infrastructure providers."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="grid md:grid-cols-2 gap-4">
        {[
          ["AI models", "OpenAI and Anthropic model support"],
          ["Vector storage", "Qdrant cloud integration"],
          ["Graph storage", "Neo4j graph backend support"],
          ["Object storage", "Supabase storage integration"],
          ["Database", "PostgreSQL + SQLModel backend"],
          ["Payments", "Paystack subscription and billing events"],
        ].map(([name, desc]) => (
          <article key={name} className="rounded-xl border border-border bg-surface/40 p-5">
            <h2 className="font-semibold">{name}</h2>
            <p className="text-sm text-muted-foreground mt-2">{desc}</p>
          </article>
        ))}
      </section>
    </PublicShell>
  );
}
