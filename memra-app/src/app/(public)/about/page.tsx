import type { Metadata } from "next";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../_components/json-ld";
import { PublicShell } from "../_components/public-shell";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about Memraiq's mission to make organizational knowledge easy to search, reason over, and trust.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: `About ${APP_NAME}`,
    description: "Our mission, product principles, and roadmap for AI knowledge work.",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "About", item: "/about" },
    ],
  };

  return (
    <PublicShell
      title="About Memraiq"
      subtitle="We build practical AI tools that make team knowledge searchable, connected, and useful."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-xl border border-border bg-surface/40 p-6 space-y-3">
        <h2 className="font-semibold">Our mission</h2>
        <p className="text-sm text-muted-foreground">
          Help teams transform fragmented docs into reliable, shared intelligence for daily decisions.
        </p>
        <h2 className="font-semibold">What we value</h2>
        <p className="text-sm text-muted-foreground">
          Grounded answers, transparent limits, and operational clarity over black-box automation.
        </p>
      </section>
    </PublicShell>
  );
}
