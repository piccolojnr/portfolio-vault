import type { Metadata } from "next";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../../_components/json-ld";
import { PublicShell } from "../../_components/public-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Read the ${APP_NAME} terms of service.`,
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Legal", item: "/legal" },
      { "@type": "ListItem", position: 3, name: "Terms", item: "/legal/terms" },
    ],
  };

  return (
    <PublicShell
      title="Terms of Service"
      subtitle="This page is a policy scaffold and should be finalized by legal counsel before production release."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
          Terms template
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Service terms and responsibility framework
        </h2>
        <p className="text-sm text-muted-foreground mt-3">
          This scaffold covers core service terms and highlights required legal completion points.
        </p>
      </section>
      <section className="rounded-xl border border-border bg-surface/40 p-6 space-y-4 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">1. Acceptance and scope</h2>
        <p>
          These terms govern access to and use of the {APP_NAME} platform by customers and their
          authorized users.
        </p>
        <p>TODO(legal): confirm legal entity names and governing jurisdiction.</p>

        <h2 className="text-base font-semibold text-foreground">2. Accounts and responsibilities</h2>
        <p>
          Customers are responsible for account security, user access controls, and lawful use of
          workspace data processed in the service.
        </p>
        <p>
          Users must not attempt to disrupt service availability, bypass controls, or use the
          platform for prohibited activities.
        </p>

        <h2 className="text-base font-semibold text-foreground">3. Plan limits and billing</h2>
        <p>
          Subscription features, document limits, and usage windows vary by selected plan and may
          change with plan upgrades or downgrades.
        </p>
        <p>TODO(legal): insert billing dispute, renewal, and cancellation clauses.</p>

        <h2 className="text-base font-semibold text-foreground">4. Service changes and availability</h2>
        <p>
          Features may evolve over time as the platform improves, with operational visibility and
          diagnostics provided through admin workflows.
        </p>
        <p>TODO(legal): confirm uptime/SLA language and maintenance notice commitments.</p>

        <h2 className="text-base font-semibold text-foreground">5. Intellectual property</h2>
        <p>
          The service and underlying software remain property of the provider. Customer content and
          workspace data remain customer-owned unless otherwise agreed in writing.
        </p>
        <p>TODO(legal): finalize license grant and feedback-use wording.</p>

        <h2 className="text-base font-semibold text-foreground">6. Liability and warranties</h2>
        <p>
          Warranty disclaimers, liability caps, and indemnity terms should be reviewed and approved
          by counsel prior to publication.
        </p>
        <p>TODO(legal): provide final limitation-of-liability and indemnification text.</p>

        <h2 className="text-base font-semibold text-foreground">7. Contact and amendments</h2>
        <p>
          Material updates to these terms should be published with effective dates and notice
          mechanics.
        </p>
        <p>TODO(legal): add legal notice contact, effective date, and amendment process.</p>
      </section>
    </PublicShell>
  );
}
