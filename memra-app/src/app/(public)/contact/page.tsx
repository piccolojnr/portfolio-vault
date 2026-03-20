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
      subtitle="Share your team context, rollout goals, and infrastructure requirements so we can scope the right path."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
              Start a conversation
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Talk to us about rollout
            </h2>
            <p className="text-sm text-muted-foreground mt-3">
              Share environment constraints, security expectations, and support needs so we can
              scope the right plan.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-bg/40 p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">Typical discussions</p>
            <p>- Deployment architecture</p>
            <p>- Plan fit and policy questions</p>
            <p>- Security and legal coordination</p>
          </div>
        </div>
      </section>
      <section className="rounded-xl border border-border bg-surface/40 p-6">
        <h2 className="font-semibold">Get in touch</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Email us at <a className="text-primary hover:underline" href="mailto:hello@memra.ai">hello@memra.ai</a> for demos,
          enterprise security reviews, and migration planning.
        </p>
        <div className="mt-5 space-y-2 text-sm text-muted-foreground">
          <p>- Deployment and architecture review</p>
          <p>- Plan and billing policy clarification</p>
          <p>- Security and legal process coordination</p>
        </div>
      </section>
    </PublicShell>
  );
}
