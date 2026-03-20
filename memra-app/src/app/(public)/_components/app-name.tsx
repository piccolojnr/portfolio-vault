import { APP_NAME } from "@/lib/env";
import { cn } from "@/lib/utils";

export function AppName({ className }: { className?: string }) {
  return (
    <span className={cn("items-baseline w-fit whitespace-nowrap", className)}>
      <span className="">{APP_NAME.substring(0, APP_NAME.length - 2)}</span>
      <span className="text-primary">{APP_NAME.substring(APP_NAME.length - 2)}</span>
    </span>
  );
}