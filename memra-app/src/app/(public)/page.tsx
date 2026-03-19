import Image from "next/image";
import { APP_NAME, APP_URL } from "@/lib/env";

function GoldLine() {
  return (
    <div
      className="h-px w-full"
      style={{
        background:
          "linear-gradient(90deg, transparent 0%, rgba(200,169,110,0.4) 20%, rgba(200,169,110,0.7) 50%, rgba(200,169,110,0.4) 80%, transparent 100%)",
      }}
    />
  );
}

function Feature({
  label,
  description,
  index,
}: {
  label: string;
  description: string;
  index: number;
}) {
  return (
    <div
      className="group relative p-6 rounded-lg border border-border/60 bg-surface/40 hover:bg-surface/70 hover:border-primary/30 transition-all duration-300"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <span className="block text-[11px] font-mono text-primary/60 mb-2 tracking-widest uppercase">
        0{index + 1}
      </span>
      <h3 className="text-sm font-semibold text-foreground mb-1.5 tracking-tight">
        {label}
      </h3>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export default function LandingPage() {
  const features = [
    {
      label: "AI-Powered Chat",
      description:
        "Converse with your documents using natural language. Ask questions, extract insights, and get cited answers grounded in your knowledge base.",
    },
    {
      label: "Document Vault",
      description:
        "Upload, organize, and manage documents with automatic chunking, embedding, and full-text search. Your knowledge, structured and searchable.",
    },
    {
      label: "Knowledge Graph",
      description:
        "Visualize relationships between concepts, entities, and documents. Discover hidden connections across your entire knowledge base.",
    },
    {
      label: "Team Workspaces",
      description:
        "Collaborate across organisations with role-based access, shared document vaults, and unified conversation histories.",
    },
  ];

  return (
    <div className="h-screen bg-bg text-text overflow-y-auto">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-bg/80 border-b border-border/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Logo"
              width={26}
              height={26}
              className="rounded-full ring-1 ring-primary/20"
            />
            <span className="text-sm font-semibold tracking-tight">
              {APP_NAME}
            </span>
          </div>
          <nav className="flex items-center gap-4">
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
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="relative pt-32 pb-24 px-6">
        {/* Subtle radial glow behind hero */}
        <div
          className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.07]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(200,169,110,1) 0%, transparent 70%)",
          }}
        />

        <div className="relative max-w-2xl mx-auto text-center space-y-6">
          <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-primary/70">
            Knowledge intelligence platform
          </p>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.15] text-foreground">
            Your documents,
            <br />
            <span className="text-primary">understood.</span>
          </h1>

          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground max-w-md mx-auto">
            {APP_NAME} transforms your documents into an intelligent knowledge
            base. Ask questions, discover connections, and work with your data
            like never before.
          </p>

          <div className="flex items-center justify-center gap-3 pt-2">
            <a
              href={`${APP_URL}/register`}
              className="text-[13px] font-mono px-5 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              start free
            </a>
            <a
              href={`${APP_URL}/login`}
              className="text-[13px] font-mono px-5 py-2.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            >
              sign in
            </a>
          </div>
        </div>

        {/* Features */}
        <section className="relative max-w-3xl mx-auto mt-28">
          <GoldLine />
          <div className="pt-12 pb-4">
            <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-muted-foreground text-center mb-8">
              What you get
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {features.map((f, i) => (
                <Feature key={f.label} index={i} {...f} />
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="relative max-w-2xl mx-auto mt-28">
          <GoldLine />
          <div className="pt-12 text-center space-y-10">
            <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-muted-foreground">
              How it works
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-center gap-8 sm:gap-12">
              {[
                { step: "01", text: "Upload your documents" },
                { step: "02", text: "AI indexes & connects" },
                { step: "03", text: "Ask anything" },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-center gap-3">
                  <span className="text-2xl font-semibold text-primary/40 font-mono">
                    {step}
                  </span>
                  <span className="text-sm text-foreground/80">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative max-w-xl mx-auto mt-28 text-center">
          <GoldLine />
          <div className="pt-12 space-y-5">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              Ready to unlock your knowledge?
            </h2>
            <p className="text-sm text-muted-foreground">
              Create an account and start building your intelligent knowledge
              base in minutes.
            </p>
            <a
              href={`${APP_URL}/register`}
              className="inline-block text-[13px] font-mono px-6 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              get started
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-[11px] font-mono text-muted-foreground/60">
            {APP_NAME} &copy; {new Date().getFullYear()}
          </span>
          <div className="flex items-center gap-4">
            <a
              href={`${APP_URL}/login`}
              className="text-[11px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              sign in
            </a>
            <a
              href={`${APP_URL}/register`}
              className="text-[11px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              register
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
