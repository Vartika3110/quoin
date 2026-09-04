import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The one button.
 *
 * Every clickable affordance in the storefront is either this or a bare
 * link inside a card. Variants exist so that a page never has to decide
 * what "the secondary button" looks like, and there are deliberately only
 * six — a seventh variant is almost always one of these six used in the
 * wrong place.
 *
 *   primary    the single most important action on the screen
 *   secondary  espresso; the alternative action next to a primary
 *   outline    equal-weight actions in a row, filters, toolbars
 *   ghost      icon buttons and anything inside dense chrome
 *   subtle     a filled but quiet button on a tinted ground
 *   pro        Quoin Pro, and nothing else
 *   danger     destructive, and only when it is genuinely destructive
 *
 * Renders `<a>` when given `href` and `<button>` otherwise, so a link that
 * looks like a button is still a link: it opens in a new tab on
 * middle-click, and a screen reader announces it as a destination rather
 * than a control.
 */

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "subtle"
  | "pro"
  | "danger";

type Size = "sm" | "md" | "lg" | "icon-sm" | "icon" | "icon-lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent shadow-xs hover:bg-accent-bright hover:shadow-sm active:bg-accent-dim",
  secondary:
    "bg-deep text-on-deep shadow-xs hover:bg-deep-soft hover:shadow-sm active:bg-deep",
  outline:
    "border border-line bg-surface text-ink hover:border-line-strong hover:bg-hover active:bg-active",
  ghost: "text-muted hover:bg-hover hover:text-ink active:bg-active",
  subtle:
    "bg-accent-wash text-accent hover:bg-accent-wash-strong active:bg-accent-wash-strong",
  pro: "bg-pro-wash text-pro border border-pro/30 hover:bg-pro/20 active:bg-pro/25",
  danger:
    "bg-danger-wash text-danger hover:bg-danger hover:text-on-accent active:bg-danger",
};

/**
 * Heights are 36 / 44 / 52. The middle one is the platform minimum for a
 * thumb, which is why it is the default rather than the smallest thing
 * that fits. `sm` is for toolbars and chips, where the control sits inside
 * something already large enough to hit.
 */
const SIZE: Record<Size, string> = {
  sm: "h-9 gap-1.5 px-3 text-caption font-medium",
  md: "h-11 gap-2 px-4 text-body font-medium",
  lg: "h-13 gap-2 px-6 text-body-lg font-medium",
  "icon-sm": "size-9",
  icon: "size-11",
  "icon-lg": "size-13",
};

const BASE =
  "relative inline-flex shrink-0 items-center justify-center rounded-lg " +
  "transition-[background-color,border-color,color,box-shadow,transform] " +
  "duration-150 ease-out-quart select-none " +
  "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

/** Filled buttons lift 2px on hover; quiet ones only change ground. */
const LIFT: Partial<Record<Variant, string>> = {
  primary: "hover:-translate-y-0.5 active:translate-y-0",
  secondary: "hover:-translate-y-0.5 active:translate-y-0",
};

interface Common {
  variant?: Variant;
  size?: Size;
  /** Stretches to the width of its container. */
  block?: boolean;
  className?: string;
  children?: ReactNode;
}

type ButtonProps = Common &
  Omit<ComponentPropsWithoutRef<"button">, "className" | "children"> & {
    href?: undefined;
    /** Swaps the label for a spinner and blocks interaction. */
    loading?: boolean;
  };

type AnchorProps = Common &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children" | "href"> & {
    href: string;
    loading?: undefined;
  };

export function Button(props: ButtonProps | AnchorProps) {
  const {
    variant = "primary",
    size = "md",
    block = false,
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    BASE,
    VARIANT[variant],
    SIZE[size],
    LIFT[variant],
    block && "w-full",
    className,
  );

  if (typeof rest.href === "string") {
    const { href, ...anchorRest } = rest as Omit<AnchorProps, keyof Common>;
    return (
      <Link href={href} className={classes} {...anchorRest}>
        {children}
      </Link>
    );
  }

  const { loading, disabled, type, ...buttonRest } = rest as Omit<
    ButtonProps,
    keyof Common
  >;

  return (
    <button
      /* Unset, a button inside a form submits it. Almost none of these
         are submit buttons, and the ones that are say so explicitly. */
      type={type ?? "button"}
      disabled={disabled || loading}
      className={classes}
      {...buttonRest}
    >
      {/* The label keeps its space while loading rather than collapsing —
          a button that changes width mid-click moves the thing under the
          cursor. */}
      <span className={cn("contents", loading && "invisible")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner className="size-4" />
        </span>
      )}
    </button>
  );
}
