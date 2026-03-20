import Image from "next/image";
import Link from "next/link";
import { APP_NAME, APP_URL } from "@/lib/env";
import { AppName } from "./app-name";

type PublicLink = {
  href: string;
  label: string;
};

export const publicPrimaryLinks: PublicLink[] = [
  { href: "/pricing", label: "Pricing" },
  { href: "/features", label: "Features" },
  { href: "/security", label: "Security" },
  { href: "/integrations", label: "Integrations" },
  { href: "/docs", label: "Docs" },
];

export const publicSecondaryLinks: PublicLink[] = [
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
  { href: "/about", label: "About" },
  { href: "/legal", label: "Legal" },
];

export function PublicShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-bg/90 border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-0 py-3">
          <Link href="/" className="flex items-end gap-2.5">
            <Image
              src="/logos/memraiq-icon-512.png"
              alt={`${APP_NAME} logo`}
              width={26}
              height={20}
            />
            <AppName className="text-sm font-semibold tracking-tight text-muted-foreground " />
          </Link>
          <nav className="hidden md:flex items-center gap-4">
            {publicPrimaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[12px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label.toLowerCase()}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <a
              href={`${APP_URL}/login`}
              className="text-[12px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              sign in
            </a>
            <a
              href={`${APP_URL}/register`}
              className="text-[12px] font-mono px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              get started
            </a>
          </div>
        </div>
      </header>

      <main className="px-6 py-14">
        <div className="max-w-6xl mx-auto">
          <section className="mb-10">
            <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-primary/70 mb-2">
              <AppName
                className="text-primary/70"
              />
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-3xl leading-relaxed">
              {subtitle}
            </p>
          </section>
          {children}
          <section className="mt-12 rounded-xl border border-border/60 bg-surface/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Explore pricing, features, and trust pages before starting your workspace.
              </p>
              <Link
                href="/pricing"
                className="text-[12px] font-mono px-3.5 py-1.5 rounded-md border border-border text-foreground hover:bg-surface/60 transition-colors"
              >
                compare plans
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/40 py-8 px-6 md:px-0">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-[11px] font-mono text-muted-foreground/70">
              <AppName 
                className="text-primary/70"
              /> &copy; {new Date().getFullYear()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              AI knowledge workspace for teams.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
              Product
            </p>
            <div className="flex flex-col gap-1.5">
              {publicPrimaryLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
              Company
            </p>
            <div className="flex flex-col gap-1.5">
              {publicSecondaryLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ))}
              <a
                href={`${APP_URL}/register`}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Start free
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
