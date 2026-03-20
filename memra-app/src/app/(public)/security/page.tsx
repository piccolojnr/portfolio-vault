import type { Metadata } from "next";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../_components/json-ld";
import { PublicShell } from "../_components/public-shell";

export const metadata: Metadata = {
  title: "Security",
  description:
    "Learn how Memra approaches data security, access controls, and operational safeguards for business use.",
  alternates: { canonical: "/security" },
  openGraph: {
    title: `${APP_NAME} Security`,
    description:
      "Security posture, controls, and trust principles for teams using Memra.",
    url: "/security",
    type: "website",
  },
};

export default function SecurityPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How is access controlled?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Memra supports role-based access controls at the organization level.",
        },
      },
      {
        "@type": "Question",
        name: "Do you expose billing and system health?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Memra includes admin observability endpoints and in-app health dashboards.",
        },
      },
    ],
  };

  return (
    <PublicShell
      title="Security and trust by design"
      subtitle="Memra is built with practical controls for team access, platform visibility, and operational reliability."
    >
      <JsonLd data={faqLd} />
      <section className="space-y-4">
        <article className="rounded-xl border border-border bg-surface/40 p-5">
          <h2 className="font-semibold">Access and identity</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Role-based access for workspace users, plus platform-admin boundaries for operations.
          </p>
        </article>
        <article className="rounded-xl border border-border bg-surface/40 p-5">
          <h2 className="font-semibold">Data handling</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Storage and retrieval pipelines are configured by environment and provider, with clear diagnostics.
          </p>
        </article>
        <article className="rounded-xl border border-border bg-surface/40 p-5">
          <h2 className="font-semibold">Observability</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Component-level health checks cover database, vector stores, graph, worker, and billing configuration.
          </p>
        </article>
      </section>
    </PublicShell>
  );
}
