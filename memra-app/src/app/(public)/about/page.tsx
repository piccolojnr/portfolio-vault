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
      subtitle="We focus on practical AI infrastructure for teams that need reliable answers from real internal context."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
              Company view
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Building useful AI infrastructure
            </h2>
            <p className="text-sm text-muted-foreground mt-3">
              We focus on grounded product behavior, transparent limits, and systems teams can
              operate with confidence.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {["Grounded", "Transparent", "Operational"].map((item) => (
              <div key={item} className="rounded-lg border border-border/50 bg-bg/40 p-3 text-center text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-xl border border-border bg-surface/40 p-6 space-y-3">
        <h2 className="font-semibold">Our mission</h2>
        <p className="text-sm text-muted-foreground">
          Help teams transform fragmented docs into reliable, shared intelligence for daily decisions.
        </p>
        <h2 className="font-semibold">What we value</h2>
        <p className="text-sm text-muted-foreground">
          Grounded answers, transparent limits, and operational clarity over black-box automation.
        </p>
        <h2 className="font-semibold">How we build</h2>
        <p className="text-sm text-muted-foreground">
          We prioritize clear architecture, observable systems, and documented workflows over vague
          AI promises.
        </p>
      </section>
    </PublicShell>
  );
}
