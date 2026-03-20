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
      <section className="rounded-xl border border-border bg-surface/40 p-6 space-y-4 text-sm text-muted-foreground">
        <p>We collect account, usage, and operational metadata necessary to provide and secure the service.</p>
        <p>We use data to operate the product, enforce limits, improve reliability, and meet legal obligations.</p>
        <p>Customers can request data access and deletion according to contractual and legal requirements.</p>
      </section>
    </PublicShell>
  );
}
