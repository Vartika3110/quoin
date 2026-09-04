import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * A summary figure.
 *
 * The number is the largest thing in the card and the label is the
 * smallest, which is the opposite of how these usually get built. Someone
 * scanning a dashboard is looking for the figure; they already know what
 * the columns are.
 *
 * Figures are set in tabular numerals so a row of four cards has its
 * digits on the same vertical rhythm — proportional numerals make a row of
 * "₹8,40,000 / ₹3,45,000 / 42% / 6" look accidentally ragged.
 */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "plain",
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "plain" | "accent" | "success" | "deep";
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-micro font-medium uppercase tracking-wide",
            tone === "deep" ? "text-on-deep/60" : "text-muted",
          )}
        >
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              "shrink-0",
              tone === "accent"
                ? "text-accent"
                : tone === "success"
                  ? "text-success"
                  : tone === "deep"
                    ? "text-on-deep/70"
                    : "text-faint",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          "nums mt-2 text-title-lg font-semibold",
          tone === "accent"
            ? "text-accent"
            : tone === "success"
              ? "text-success"
              : tone === "deep"
                ? "text-on-deep"
                : "text-ink",
        )}
      >
        {value}
      </p>
      {hint && (
        <p
          className={cn(
            "mt-1 text-micro",
            tone === "deep" ? "text-on-deep/60" : "text-faint",
          )}
        >
          {hint}
        </p>
      )}
    </>
  );

  const classes = cn(
    "rounded-card border p-4",
    tone === "deep"
      ? "border-transparent bg-deep"
      : "border-line-soft bg-surface",
    href &&
      "transition-[transform,box-shadow,border-color] duration-200 ease-out-quart hover:-translate-y-0.5 hover:border-line hover:shadow-md",
    className,
  );

  return href ? (
    <Link href={href} className={cn("block", classes)}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
