import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * A chip.
 *
 * Tones carry meaning, not decoration: `success` is used where something
 * is genuinely available or complete, `warning` where a customer needs to
 * act, `danger` where something failed. A tone picked because it looked
 * good next to the card is how a badge system stops meaning anything.
 */

type Tone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "pro"
  | "deep";

const TONE: Record<Tone, string> = {
  neutral: "border-line-soft bg-raised text-muted",
  accent: "border-accent-edge bg-accent-wash text-accent",
  success: "border-success/25 bg-success-wash text-success",
  warning: "border-warning/25 bg-warning-wash text-warning",
  danger: "border-danger/25 bg-danger-wash text-danger",
  info: "border-info/25 bg-info-wash text-info",
  pro: "border-pro/30 bg-pro-wash text-pro",
  deep: "border-transparent bg-deep text-on-deep",
};

export function Badge({
  children,
  tone = "neutral",
  icon,
  size = "md",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-micro" : "px-2 py-1 text-micro",
        TONE[tone],
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * A count, as a filled circle. Sized so a two-digit number still fits
 * without the circle turning into an ellipse; past 99 it says "99+",
 * because a cart with 137 items is "a lot" and the exact number is on the
 * cart page.
 */
export function Counter({
  value,
  tone = "accent",
  className,
}: {
  value: number;
  tone?: "accent" | "deep";
  className?: string;
}) {
  if (value <= 0) return null;
  return (
    <span
      className={cn(
        "nums grid h-5 min-w-5 place-items-center rounded-full px-1 text-micro font-semibold tabular-nums",
        tone === "accent" ? "bg-accent text-on-accent" : "bg-deep text-on-deep",
        className,
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

/** Small uppercase label above a heading. Never used on its own. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-eyebrow uppercase text-accent", className)}>{children}</p>
  );
}
