import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/env";
import { JsonLd } from "../_components/json-ld";
import { PublicShell } from "../_components/public-shell";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Access legal policies including privacy, terms of service, and data processing addendum.",
  alternates: { canonical: "/legal" },
  openGraph: {
    title: `${APP_NAME} Legal`,
    description: "Privacy, terms, and data processing legal documentation.",
    url: "/legal",
    type: "website",
  },
};

export default function LegalPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Legal", item: "/legal" },
    ],
  };

  return (
    <PublicShell
      title="Legal center"
      subtitle="Review legal terms, privacy practices, and processing terms. These pages are implementation-ready templates pending legal review."
    >
      <JsonLd data={breadcrumbLd} />
      <section className="rounded-2xl border border-border bg-surface/40 p-6 mb-8">
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] font-mono tracking-[0.2em] uppercase text-primary/70 mb-2">
              Legal overview
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Policy templates with clear review points
            </h2>
            <p className="text-sm text-muted-foreground mt-3">
              Use these documents to review privacy, service terms, and processing commitments
              before legal finalization.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-bg/40 p-4 text-sm text-muted-foreground space-y-2">
            <p>- Privacy policy structure</p>
            <p>- Terms and service boundaries</p>
            <p>- DPA processing framework</p>
            <p>- Explicit counsel TODO markers</p>
          </div>
        </div>
      </section>
      <section className="grid md:grid-cols-3 gap-4">
        {[
          ["/legal/privacy", "Privacy Policy", "How we collect, use, and protect data."],
          ["/legal/terms", "Terms of Service", "Service terms, responsibilities, and limits."],
          ["/legal/dpa", "Data Processing Addendum", "Processing terms for business customers."],
        ].map(([href, title, desc]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-border bg-surface/40 p-5 hover:bg-surface/60 transition-colors"
          >
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-2">{desc}</p>
          </Link>
        ))}
      </section>
      <section className="mt-10 rounded-xl border border-border bg-surface/40 p-6 space-y-3 text-sm text-muted-foreground">
        <p>
          This legal center is intended to provide transparent policy structure for customers evaluating the platform.
        </p>
        <p>
          Final enforceable language should be approved by counsel before production publication.
        </p>
        <p>TODO(legal): add legal contact entity, jurisdiction, and policy effective date.</p>
      </section>
    </PublicShell>
  );
}
