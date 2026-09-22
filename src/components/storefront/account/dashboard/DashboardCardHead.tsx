import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * The icon-and-title row every overview card opens with.
 *
 * Pulled out on its own because six cards repeating the same bubble markup
 * is exactly how one of them quietly stops matching the other five after
 * the next edit — see `docs/design-system.md` on why a system like this
 * one exists at all.
 */
export function DashboardCardHead({
  icon,
  title,
  tone = "accent",
}: {
  icon: ReactNode;
  title: ReactNode;
  tone?: "accent" | "pro";
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          tone === "pro" ? "bg-pro-wash text-pro" : "bg-accent-wash text-accent",
        )}
      >
        {icon}
      </span>
      <p className="min-w-0 truncate text-title-sm font-semibold text-ink">{title}</p>
    </div>
  );
}
