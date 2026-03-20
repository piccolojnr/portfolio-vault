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
      subtitle="Security posture centers on access boundaries, operational diagnostics, and transparent platform behavior."
    >
      <JsonLd data={faqLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70">
              Trust model
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Practical controls, clear boundaries
            </h2>
            <p>
              This page summarizes documented security posture and platform safeguards for
              evaluation and planning.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {["Access", "Data", "Observability", "Incidents"].map((item) => (
              <div key={item} className="rounded-lg border border-border/50 bg-bg/40 p-3 text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          TODO(security): publish formal compliance and certification statements only after approval.
        </p>
      </section>
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
        <article className="rounded-xl border border-border bg-surface/40 p-5">
          <h2 className="font-semibold">Incident and operations readiness</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Operational workflows include diagnostics-first behavior to help teams investigate outages and dependency degradation quickly.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            TODO(security): define externally published incident communication expectations.
          </p>
        </article>
      </section>
    </PublicShell>
  );
}
