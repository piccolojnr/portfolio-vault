"use client";

// import Link from "next/link";
import { redirect } from "next/navigation";
// import { cn } from "@/lib/utils";

// const tabs = [
//   { href: "/admin/jobs",      label: "Jobs" },
//   { href: "/admin/ai-calls",  label: "AI Costs" },
//   { href: "/admin/settings",  label: "Settings" },
// ];

export default function AdminLayout({  }: { children: React.ReactNode }) {
  redirect("/");
  // const pathname = usePathname();

  // return (
  //   <div className="h-full flex flex-col bg-bg text-foreground overflow-hidden">
  //     {/* Sub-nav */}
  //     <div className="shrink-0 px-6 pt-5 flex items-center gap-1 border-b border-border/40 pb-0">
  //       {tabs.map(({ href, label }) => {
  //         const active = pathname.startsWith(href);
  //         return (
  //           <Link
  //             key={href}
  //             href={href}
  //             className={cn(
  //               "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
  //               active
  //                 ? "border-primary text-foreground"
  //                 : "border-transparent text-muted-foreground hover:text-foreground",
  //             )}
  //           >
  //             {label}
  //           </Link>
  //         );
  //       })}
  //     </div>

  //     <div className="flex-1 overflow-hidden">
  //       {children}
  //     </div>
  //   </div>
  // );
}
