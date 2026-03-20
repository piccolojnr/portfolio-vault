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
      subtitle="Connect knowledge workflows to model, storage, graph, and billing infrastructure already used in production systems."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
              Integration map
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Connect to your existing architecture
            </h2>
            <p className="text-sm text-muted-foreground mt-3">
              Integration points reflect current backend architecture and deployment configuration
              paths.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
            {["Models", "Storage", "Graph", "DB", "Billing", "Workers"].map((item) => (
              <div key={item} className="rounded-lg border border-border/50 bg-bg/40 p-2.5 text-center">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
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
      <section className="mt-10 rounded-xl border border-border bg-surface/40 p-6 text-sm text-muted-foreground space-y-2">
        <p>Provider selection and configuration are controlled through environment and runtime settings.</p>
        <p>TODO(integrations): publish supported provider/version matrix for customer-facing docs.</p>
      </section>
    </PublicShell>
  );
}
