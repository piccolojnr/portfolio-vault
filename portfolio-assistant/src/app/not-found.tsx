import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-0 px-6 text-center">
      <p className="font-mono text-[11px] text-primary tracking-widest uppercase mb-4">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
        Page not found
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        This conversation or page doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="font-mono text-xs text-primary hover:underline underline-offset-4"
      >
        back to chat
      </Link>
    </div>
  );
}
