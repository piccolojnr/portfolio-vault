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

  return (
    <PublicShell
      title="Simple pricing for every stage"
      subtitle="Start free, then scale with plan limits and governance designed for teams."
    >
      <JsonLd data={jsonLd} />
      <section className="grid md:grid-cols-3 gap-4">
        {[
          ["Free", "Best for getting started", "5 documents", "Community support"],
          ["Pro", "For growing teams", "500 documents", "Priority support"],
          ["Enterprise", "For advanced governance", "Custom limits", "SLA + SSO"],
        ].map(([name, desc, docs, support]) => (
          <article key={name} className="rounded-xl border border-border bg-surface/40 p-5">
            <h2 className="text-xl font-semibold">{name}</h2>
            <p className="text-sm text-muted-foreground mt-1">{desc}</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>{docs}</li>
              <li>{support}</li>
              <li>Monthly token quota by plan window</li>
            </ul>
          </article>
        ))}
      </section>
    </PublicShell>
  );
}
