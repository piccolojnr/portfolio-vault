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
      subtitle="Key legal policies for using Memra."
    >
      <JsonLd data={breadcrumbLd} />
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
    </PublicShell>
  );
}
