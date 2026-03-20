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
      <section className="rounded-xl border border-border bg-surface/40 p-6 space-y-4 text-sm text-muted-foreground">
        <p>This addendum defines processing instructions, security measures, and subprocessors.</p>
        <p>It applies when Memra processes personal data on behalf of customer organizations.</p>
        <p>Cross-border transfer mechanisms and deletion timelines are defined in executed customer agreements.</p>
      </section>
    </PublicShell>
  );
}
