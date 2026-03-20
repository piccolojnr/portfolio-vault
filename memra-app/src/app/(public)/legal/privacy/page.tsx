import type { Metadata } from "next";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../../_components/json-ld";
import { PublicShell } from "../../_components/public-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Read the ${APP_NAME} privacy policy.`,
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Legal", item: "/legal" },
      { "@type": "ListItem", position: 3, name: "Privacy", item: "/legal/privacy" },
    ],
  };

  return (
    <PublicShell
      title="Privacy Policy"
      subtitle="This page is a policy scaffold and should be finalized by legal counsel before production release."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
          Privacy template
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Data handling policy scaffold
        </h2>
        <p className="text-sm text-muted-foreground mt-3">
          This structure is designed for legal review and completion. Fill TODO markers before
          production publication.
        </p>
      </section>
      <section className="rounded-xl border border-border bg-surface/40 p-6 space-y-4 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">1. Scope and roles</h2>
        <p>
          This policy describes how {APP_NAME} handles personal data when providing hosted
          software services.
        </p>
        <p>
          TODO(legal): define controller/processor role by product context and customer contract type.
        </p>

        <h2 className="text-base font-semibold text-foreground">2. Data we collect</h2>
        <p>
          We collect account information, service usage metadata, and technical operational data
          required to run, secure, and improve the platform.
        </p>
        <p>
          Document and workspace data are processed to support indexing, retrieval, and response
          workflows initiated by authorized users.
        </p>
        <p>TODO(legal): confirm explicit category list and legal basis per region.</p>

        <h2 className="text-base font-semibold text-foreground">3. How data is used</h2>
        <p>
          Data is used to operate core services, enforce plan limits, monitor reliability, resolve
          incidents, and comply with legal obligations.
        </p>
        <p>TODO(legal): confirm permitted product analytics and retention period language.</p>

        <h2 className="text-base font-semibold text-foreground">4. Sharing and subprocessors</h2>
        <p>
          Service infrastructure may rely on third-party providers for storage, model access,
          billing, and observability functions.
        </p>
        <p>TODO(legal): publish subprocessor list and update notification process.</p>

        <h2 className="text-base font-semibold text-foreground">5. Data rights and requests</h2>
        <p>
          Customers can request access, correction, export, or deletion in line with contract terms
          and applicable law.
        </p>
        <p>TODO(legal): add request channel, verification method, and statutory timing commitments.</p>

        <h2 className="text-base font-semibold text-foreground">6. International transfers</h2>
        <p>
          Cross-border processing may occur where infrastructure providers operate in multiple
          regions.
        </p>
        <p>TODO(legal): document transfer mechanisms and regional safeguards.</p>

        <h2 className="text-base font-semibold text-foreground">7. Contact and updates</h2>
        <p>
          Material policy updates will be communicated through product channels and this page.
        </p>
        <p>TODO(legal): add official privacy contact and policy effective date.</p>
      </section>
    </PublicShell>
  );
}
