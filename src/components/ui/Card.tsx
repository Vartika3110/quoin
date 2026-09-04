import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * A surface.
 *
 * Three tones, and the difference between them is what the card is for
 * rather than how it looks:
 *
 *   plain     resting content. A hairline, no shadow. Most cards.
 *   raised    content that must separate from a tinted or busy ground.
 *   sunk      a well — filter panels, summaries, anything the eye should
 *             read as *inside* the page rather than on top of it.
 *
 * `interactive` is the hover treatment, and is applied only when the whole
 * card is one target. A card containing three separate links is not
 * interactive; its links are.
 */

type Tone = "plain" | "raised" | "sunk" | "accent" | "deep";

const TONE: Record<Tone, string> = {
  plain: "border border-line-soft bg-surface",
  raised: "border border-line-soft bg-surface shadow-sm",
  sunk: "border border-line-hair bg-sunk",
  accent: "border border-accent-edge bg-accent-wash",
  deep: "border border-transparent bg-deep text-on-deep",
};

const PAD = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5 lg:p-6",
  xl: "p-6 lg:p-8",
} as const;

interface CardProps {
  tone?: Tone;
  padding?: keyof typeof PAD;
  /** Adds the hover lift. Only for cards that are themselves one target. */
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}

function cardClasses({
  tone = "plain",
  padding = "md",
  interactive = false,
  className,
}: Omit<CardProps, "children">) {
  return cn(
    "rounded-card",
    TONE[tone],
    PAD[padding],
    interactive &&
      /* 2px and a shadow step. Transform rather than margin so the lift
         composites without reflowing the grid it sits in. */
      "transition-[transform,box-shadow,border-color] duration-200 ease-out-quart " +
        "hover:-translate-y-0.5 hover:border-line hover:shadow-md",
    className,
  );
}

export function Card({ children, ...rest }: CardProps) {
  return <div className={cardClasses(rest)}>{children}</div>;
}

/** The same surface, as one link. */
export function CardLink({
  href,
  children,
  interactive = true,
  ...rest
}: CardProps & { href: string }) {
  return (
    <Link href={href} className={cn("block", cardClasses({ ...rest, interactive }))}>
      {children}
    </Link>
  );
}

/**
 * A card's header row: title on the left, an optional action on the right.
 * Exists so that the gap between a card title and its body is one decision
 * rather than forty.
 */
export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h3 className="text-title-sm font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-1 text-caption text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
