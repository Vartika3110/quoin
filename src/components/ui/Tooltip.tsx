"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * A hover hint.
 *
 * Used sparingly, and never for information a customer needs: a tooltip
 * is invisible on a touch screen until tapped and invisible to a keyboard
 * user until focused, so anything load-bearing goes in the layout
 * instead. What it is for is naming an icon-only control and expanding an
 * abbreviation.
 *
 * Opens on focus as well as hover, and is wired with `aria-describedby`,
 * so the same text reaches a keyboard and a screen reader rather than
 * being a mouse-only affordance.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} className="contents">
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "anim-fade pointer-events-none absolute left-1/2 z-50 w-max max-w-56 -translate-x-1/2 rounded-md bg-deep px-2 py-1 text-micro text-on-deep shadow-md",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
