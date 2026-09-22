import Link from "next/link";
import type { ReactNode } from "react";
import { Chevron } from "@/components/icons";
import { Photo } from "@/components/ui/Photo";
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

type Tone = "plain" | "raised" | "sunk" | "accent";

const TONE: Record<Tone, string> = {
  plain: "border border-line-soft bg-surface",
  raised: "border border-line-soft bg-surface shadow-sm",
  sunk: "border border-line-hair bg-sunk",
  accent: "border border-accent-edge bg-accent-wash",
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
        <h3 className="font-display text-title-sm font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-1 text-caption text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ---- The two cards -------------------------------------------------------
 *
 * Everything the storefront presents as a *card* is one of these two, and
 * there is no third. Before them there were five — pastel icon tiles on
 * the home page, outlined service cards, photographic category tiles,
 * bordered idea tiles and the commerce card — which is how a page ends up
 * with four different answers to "what does a thing you can click look
 * like" stacked on top of each other.
 *
 *   ImageCard    the photograph *is* the card. Scrim, serif title.
 *   ContentCard  a white surface with a hairline. Sans, always.
 *
 * `Card` above is not a third card. It is the surface `ContentCard` is
 * built on, and the tone it keeps beyond `plain` — `sunk` for a well,
 * `accent` for a highlighted panel — are page furniture, not things a
 * reader clicks.
 */

/**
 * A photograph with type on it.
 *
 * The scrim is not optional and it is espresso rather than black: this
 * photography is warm, and a neutral black scrim greys everything under
 * it while the rest of the palette stays warm. It is sized to three
 * fifths of the card because a scrim cut to the short titles leaves the
 * long ones sitting half on bare photograph.
 *
 * The title is the display face — this is the one place a card gets it,
 * and it is what separates an image card from a photograph with a caption.
 */
export function ImageCard({
  href,
  src,
  title,
  subtitle,
  caption,
  ratio = "4 / 5",
  sizes,
  label,
  blurDataURL,
  priority = false,
  unoptimized = false,
  overlay,
  className,
}: {
  href: string;
  src: string | null | undefined;
  title: ReactNode;
  /** One line under the title. Sans, always — the serif is the title's. */
  subtitle?: ReactNode;
  /** The small line under both — a price floor, a count. */
  caption?: ReactNode;
  ratio?: string;
  sizes: string;
  /** What the missing-photo tile says. Falls back to nothing. */
  label?: string;
  blurDataURL?: string | null;
  priority?: boolean;
  unoptimized?: boolean;
  /** Controls that sit over the photograph — a save button, a pill. */
  overlay?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col justify-end overflow-hidden rounded-card",
        className,
      )}
    >
      <Photo
        src={src}
        /* Decorative: the title below is inside this same link and
           already names the thing. */
        alt=""
        ratio={ratio}
        sizes={sizes}
        label={label}
        blurDataURL={blurDataURL}
        priority={priority}
        unoptimized={unoptimized}
        className="absolute inset-0 size-full"
        imageClassName="transition-transform duration-500 ease-out-quart group-hover:scale-[1.04]"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-deep via-deep/65 to-transparent" />

      <div className="relative p-4">
        <h3 className="font-display text-title-sm font-semibold leading-snug text-on-deep">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 line-clamp-1 text-micro text-on-deep/75">{subtitle}</p>
        )}
        {caption && (
          <span className="mt-1.5 flex items-center gap-1 text-micro text-on-deep/85">
            {caption}
            <Chevron className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        )}
      </div>

      {overlay}
    </Link>
  );
}

/**
 * A white surface with a hairline, and sans type inside it.
 *
 * The slots are the ones every content card in the storefront turned out
 * to need, and they are ordered rather than free-form so that four of
 * these side by side line up: icon, title, body, then `rows` and `footer`
 * both pinned to the bottom of a full-height card. That is what makes
 * "Pricing" sit on the same line across four service cards whose
 * summaries run to different lengths — `h-full` on the card plus
 * `flex-1` on the body, not four hand-tuned min-heights.
 */
export function ContentCard({
  href,
  icon,
  badge,
  title,
  subtitle,
  rows,
  footer,
  children,
  align = "start",
  size = "md",
  padding,
  className,
}: {
  /** Renders the whole card as one link when given. */
  href?: string;
  icon?: ReactNode;
  /** Top-right — a `Badge`, a count. */
  badge?: ReactNode;
  title: ReactNode;
  /** One line of what this is. */
  subtitle?: ReactNode;
  /** The aligned term/detail block above the footer. */
  rows?: { term: string; detail: ReactNode }[];
  /** Pinned to the bottom, on a shared baseline across a row of cards. */
  footer?: ReactNode;
  children?: ReactNode;
  /** `center` is the phone launcher row; `start` is everything else. */
  align?: "start" | "center";
  size?: "sm" | "md";
  /**
   * `none` hands the padding to the caller.
   *
   * A prop rather than something a caller overrides through `className`,
   * because `cn` is a join and not a merge: two padding utilities both
   * land in the class list and the one Tailwind emits later in the
   * stylesheet wins, which is `p-4` over `p-1.5` regardless of the order
   * they were written in. A card that silently ignored the padding it was
   * given is exactly the bug this prop removes.
   */
  padding?: "none" | "sm" | "md";
  className?: string;
}) {
  const body = (
    <>
      {(icon || badge) && (
        <div
          className={cn(
            "flex w-full items-start gap-2",
            align === "center" ? "justify-center" : "justify-between",
          )}
        >
          {icon && (
            <span
              className={cn(
                "grid shrink-0 place-items-center rounded-lg bg-accent-wash text-accent transition-colors",
                href && "group-hover:bg-accent group-hover:text-on-accent",
                size === "sm" ? "size-9" : "size-11",
              )}
            >
              {icon}
            </span>
          )}
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
      )}

      {/* A flex column, so a card that needs its own vertical
          distribution — a mark floated into the middle, a detail line
          pinned under it — can say so with `my-auto` on a child rather
          than needing a second body slot. Stacking is unchanged for the
          cards that just want title-then-text. */}
      <div className={cn("flex min-w-0 flex-1 flex-col", (icon || badge) && "mt-4")}>
        <h3
          className={cn(
            "font-display font-semibold text-ink",
            size === "sm" ? "text-body" : "text-title-sm",
          )}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            className={cn(
              "mt-1.5 leading-relaxed text-muted",
              size === "sm" ? "text-micro" : "text-body-sm",
            )}
          >
            {subtitle}
          </p>
        )}
        {children}
      </div>

      {rows && rows.length > 0 && (
        <dl className="mt-4 w-full space-y-1 border-t border-line-hair pt-3 text-micro">
          {rows.map((row) => (
            <div key={row.term} className="flex gap-2">
              <dt className="w-16 shrink-0 text-faint">{row.term}</dt>
              {/* Clamped to two lines and held at two lines' height, so
                  four of these side by side line up. Without the floor, a
                  one-line "Pricing" under a two-line one puts the
                  footers on different baselines even though every card is
                  the same height; without the ceiling, a three-line
                  detail does the same in the other direction. */}
              <dd className="line-clamp-2 min-h-[2.75em] min-w-0 flex-1 leading-snug text-muted">
                {row.detail}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {footer && <div className="mt-4 w-full">{footer}</div>}
    </>
  );

  const pad = padding ?? (size === "sm" ? "sm" : "md");

  const classes = cn(
    "flex h-full flex-col rounded-card border border-line-soft bg-surface",
    pad === "sm" ? "p-4" : pad === "md" ? "p-5" : "",
    align === "center" && "items-center text-center",
    href &&
      "group transition-[transform,box-shadow,border-color] duration-200 ease-out-quart hover:-translate-y-0.5 hover:border-line hover:shadow-md active:scale-[0.99]",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
