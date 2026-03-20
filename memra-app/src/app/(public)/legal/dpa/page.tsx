import type { Metadata } from "next";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../../_components/json-ld";
import { PublicShell } from "../../_components/public-shell";

export const metadata: Metadata = {
  title: "Data Processing Addendum",
  description: `Read the ${APP_NAME} data processing addendum.`,
  alternates: { canonical: "/legal/dpa" },
};

export default function DpaPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Legal", item: "/legal" },
      { "@type": "ListItem", position: 3, name: "DPA", item: "/legal/dpa" },
    ],
  };

  return (
    <PublicShell
      title="Data Processing Addendum"
      subtitle="This page is a policy scaffold and should be finalized by legal counsel before production release."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
          DPA template
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Processing commitments and controls
        </h2>
        <p className="text-sm text-muted-foreground mt-3">
          This addendum scaffold is structured for customer review and legal completion.
        </p>
      </section>
      <section className="rounded-xl border border-border bg-surface/40 p-6 space-y-4 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">1. Purpose and applicability</h2>
        <p>
          This addendum applies when {APP_NAME} processes personal data on behalf of a customer in
          connection with the subscribed service.
        </p>
        <p>TODO(legal): confirm legal entity references and precedence with master agreement.</p>

        <h2 className="text-base font-semibold text-foreground">2. Processing details</h2>
        <p>
          Processing includes storage, indexing, retrieval, and related operational activities
          required to deliver document intelligence features.
        </p>
        <p>
          TODO(legal): provide annex covering data subjects, data categories, processing purpose,
          and processing duration.
        </p>

        <h2 className="text-base font-semibold text-foreground">3. Customer instructions and controls</h2>
        <p>
          Processing occurs under documented customer instructions expressed through service
          configuration and contractual terms.
        </p>
        <p>TODO(legal): define process for handling additional or conflicting instructions.</p>

        <h2 className="text-base font-semibold text-foreground">4. Security measures</h2>
        <p>
          The service incorporates access controls, operational diagnostics, and infrastructure
          safeguards appropriate for hosted software operations.
        </p>
        <p>TODO(legal): attach formal technical and organizational measures schedule.</p>

        <h2 className="text-base font-semibold text-foreground">5. Subprocessors</h2>
        <p>
          Third-party providers may support infrastructure, model, storage, and billing functions
          required for platform operation.
        </p>
        <p>TODO(legal): add current subprocessor list and objection notification workflow.</p>

        <h2 className="text-base font-semibold text-foreground">6. International transfers and deletion</h2>
        <p>
          Transfer safeguards and post-termination deletion/return commitments should be applied as
          defined in the executed customer agreement.
        </p>
        <p>TODO(legal): define SCC/transfer mechanism and deletion timeline details.</p>

        <h2 className="text-base font-semibold text-foreground">7. Audit and cooperation</h2>
        <p>
          Reasonable audit and compliance cooperation procedures should align to customer risk and
          applicable law.
        </p>
        <p>TODO(legal): add audit rights process and incident notification timeline language.</p>
      </section>
    </PublicShell>
  );
}
