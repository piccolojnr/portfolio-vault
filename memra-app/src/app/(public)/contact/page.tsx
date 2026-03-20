import type { Metadata } from "next";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../_components/json-ld";
import { PublicShell } from "../_components/public-shell";

export const metadata: Metadata = {
  title: "Contact Sales",
  description:
    "Talk to the Memra team about enterprise deployment, security requirements, and onboarding.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: `Contact ${APP_NAME}`,
    description:
      "Contact sales for enterprise pricing, security reviews, and implementation support.",
    url: "/contact",
    type: "website",
  },
};

export default function ContactPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Contact", item: "/contact" },
    ],
  };

  return (
    <PublicShell
      title="Contact sales and support"
      subtitle="Tell us about your team, data workflow, and rollout goals."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-xl border border-border bg-surface/40 p-6">
        <h2 className="font-semibold">Get in touch</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Email us at <a className="text-primary hover:underline" href="mailto:hello@memra.ai">hello@memra.ai</a> for demos,
          enterprise security reviews, and migration planning.
        </p>
      </section>
    </PublicShell>
  );
}
