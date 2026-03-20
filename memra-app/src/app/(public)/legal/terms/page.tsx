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
      <section className="rounded-xl border border-border bg-surface/40 p-6 space-y-4 text-sm text-muted-foreground">
        <p>These terms govern use of the service, account responsibilities, and acceptable use.</p>
        <p>Plan limits and billing terms apply according to selected subscription and current policy.</p>
        <p>Service availability and warranties are defined by contract and applicable law.</p>
      </section>
    </PublicShell>
  );
}
