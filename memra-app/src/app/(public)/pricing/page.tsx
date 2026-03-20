import type { Metadata } from "next";
import { APP_NAME, APP_URL } from "@/lib/env";
import { JsonLd } from "../_components/json-ld";
import { PublicShell } from "../_components/public-shell";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Flexible pricing for teams of every size. Start free, then upgrade to Pro or Enterprise as your knowledge base grows.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: `${APP_NAME} Pricing`,
    description:
      "Compare Free, Pro, and Enterprise plans for document intelligence and AI knowledge search.",
    url: "/pricing",
    type: "website",
  },
};

export default function PricingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: APP_NAME,
    applicationCategory: "BusinessApplication",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro", price: "29", priceCurrency: "USD" },
      { "@type": "Offer", name: "Enterprise", price: "99", priceCurrency: "USD" },
    ],
    url: `${APP_URL}/pricing`,
  };

  const plans = [
    {
      name: "Free",
      audience: "Best for evaluation and individual workflows",
      price: "$0",
      details: [
        "Core document indexing and grounded chat workflows",
        "Starter limits for documents and usage windows",
        "Self-serve setup with community-level support",
      ],
      cta: "Start free",
    },
    {
      name: "Pro",
      audience: "For teams scaling shared knowledge operations",
      price: "$29",
      details: [
        "Higher document and usage ceilings for active teams",
        "Expanded operational controls and support priority",
        "Designed for recurring team collaboration workflows",
      ],
      cta: "Upgrade to Pro",
    },
    {
      name: "Enterprise",
      audience: "For organizations with governance requirements",
      price: "$99",
      details: [
        "Custom limit strategy and deployment planning support",
        "Governance and trust workflows for multi-team operations",
        "Contract-backed onboarding and security review process",
      ],
      cta: "Talk to sales",
    },
  ];

  return (
    <PublicShell
      title="Pricing that scales with your team"
      subtitle="Begin with a free workspace and move to higher-capability plans as your retrieval, governance, and support needs grow."
    >
      <JsonLd data={jsonLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
              Plan overview
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Choose your operating tier
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Every plan supports grounded retrieval workflows. Higher tiers increase limits,
              governance depth, and implementation support.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 self-start text-center">
            {[
              ["Free", "Starter"],
              ["Pro", "Team scale"],
              ["Enterprise", "Governance"],
            ].map(([name, label]) => (
              <article key={name} className="rounded-lg border border-border/60 bg-bg/40 p-3">
                <p className="text-sm font-semibold">{name}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="grid md:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <article key={plan.name} className="rounded-xl border border-border bg-surface/40 p-5">
            <h2 className="text-xl font-semibold">{plan.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">{plan.audience}</p>
            <p className="mt-4 text-2xl font-semibold">{plan.price}</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {plan.details.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <a
              href={plan.name === "Enterprise" ? "/contact" : `${APP_URL}/register`}
              className="inline-block mt-5 text-[12px] font-mono px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {plan.cta.toLowerCase()}
            </a>
          </article>
        ))}
      </section>

      <section className="mt-12 rounded-xl border border-border bg-surface/40 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">Plan notes and guardrails</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Limits are enforced by plan windows and product configuration to keep usage transparent.
          </p>
          <p>
            Upgrades and downgrades follow current billing policy behavior documented in product docs.
          </p>
          <p>TODO(pricing): confirm public-facing billing cycle language with finance owner.</p>
          <p>TODO(pricing): confirm enterprise contract terms and SLA wording before launch.</p>
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-border bg-surface/40 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-3">Frequently asked questions</h2>
        <div className="space-y-4 text-sm">
          <article>
            <h3 className="font-semibold">Can we start free and upgrade later?</h3>
            <p className="text-muted-foreground mt-1">
              Yes. Teams can start in a free workspace and move to higher plans as usage and governance needs increase.
            </p>
          </article>
          <article>
            <h3 className="font-semibold">Do all plans include grounded retrieval?</h3>
            <p className="text-muted-foreground mt-1">
              Core retrieval and document-indexing workflows are available from the start, with limits and support varying by plan.
            </p>
          </article>
          <article>
            <h3 className="font-semibold">How do enterprise agreements work?</h3>
            <p className="text-muted-foreground mt-1">
              Enterprise onboarding is scoped with the team directly through security and legal review.
            </p>
          </article>
        </div>
      </section>
    </PublicShell>
  );
}
