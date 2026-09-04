/* `WithRef`, not `WithoutRef`: in React 19 `ref` is an ordinary prop on a
   function component, so spreading props onto the element forwards it —
   and callers do need it, to focus a code field after it appears. */
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Form controls.
 *
 * Every field is 44px tall and 16px on a phone. The height is the thumb
 * target; the font size is because iOS Safari zooms the viewport in on
 * focus for anything under 16px, and page zoom is deliberately left
 * enabled, so a 14px input means the page jumps on every tap.
 */

const FIELD_BASE =
  "w-full rounded-lg border bg-surface text-ink placeholder:text-faint " +
  "transition-[border-color,box-shadow] duration-150 " +
  "focus:outline-none focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-sunk disabled:text-faint";

/** Focus is a ring rather than an outline so it follows the rounded edge. */
const FIELD_FOCUS =
  "focus:border-accent focus:shadow-[0_0_0_3px_var(--quoin-ring)]";

const FIELD_INVALID =
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_var(--quoin-danger-wash)]";

/**
 * Label, control, hint and error as one unit.
 *
 * The hint and the error occupy the same slot: showing both stacks two
 * lines of small type under a field and the reader has to work out which
 * one is the problem. The error replaces the hint, because once there is
 * an error the hint has already failed to prevent it.
 */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-caption font-medium text-ink"
      >
        {label}
        {required && (
          <span className="text-accent" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-msg`} role="alert" className="text-micro text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-msg`} className="text-micro text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  leading,
  trailing,
  ...props
}: ComponentPropsWithRef<"input"> & {
  /** Icon or adornment inside the field, before the text. */
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  if (!leading && !trailing) {
    return (
      <input
        className={cn(FIELD_BASE, FIELD_FOCUS, FIELD_INVALID, "h-11 border-line px-3.5 text-body-lg lg:text-body", className)}
        {...props}
      />
    );
  }

  /* With an adornment the ring has to be drawn on the wrapper, since the
     input no longer owns the visible edge. `focus-within` rather than
     `focus` for the same reason. */
  return (
    <div
      className={cn(
        FIELD_BASE,
        "flex h-11 items-center gap-2 border-line px-3.5",
        "focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--quoin-ring)]",
        className,
      )}
    >
      {leading && <span className="shrink-0 text-muted">{leading}</span>}
      <input
        className="min-w-0 flex-1 bg-transparent text-body-lg text-ink outline-none placeholder:text-faint lg:text-body"
        {...props}
      />
      {trailing && <span className="shrink-0 text-muted">{trailing}</span>}
    </div>
  );
}

export function Textarea({
  className,
  ...props
}: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      className={cn(
        FIELD_BASE,
        FIELD_FOCUS,
        FIELD_INVALID,
        "min-h-24 resize-y border-line px-3.5 py-2.5 text-body-lg leading-relaxed lg:text-body",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A native select, styled.
 *
 * Native rather than a custom listbox on purpose: on a phone the platform
 * picker is better than anything rebuilt in a div, it is keyboard- and
 * screen-reader-correct for free, and the only thing lost is the ability
 * to put an icon next to an option.
 */
export function Select({
  className,
  children,
  ...props
}: ComponentPropsWithRef<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          FIELD_BASE,
          FIELD_FOCUS,
          "h-11 appearance-none border-line pl-3.5 pr-9 text-body-lg lg:text-body",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

/**
 * A checkbox or radio drawn as a tinted row.
 *
 * Used everywhere a filter is chosen. The whole row is the target, which
 * is the difference between a filter panel that works with a thumb and
 * one that needs a fingernail.
 */
export function CheckRow({
  label,
  count,
  className,
  ...props
}: ComponentPropsWithRef<"input"> & {
  label: ReactNode;
  /** Result count for this option, right-aligned. */
  count?: number;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-body text-ink transition-colors hover:bg-hover has-[:checked]:text-accent",
        className,
      )}
    >
      <input
        type={props.type ?? "checkbox"}
        className="peer sr-only"
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          "grid size-[18px] shrink-0 place-items-center border border-line-strong bg-surface transition-colors",
          props.type === "radio" ? "rounded-full" : "rounded-xs",
          "peer-checked:border-accent peer-checked:bg-accent",
          /* The tick is a descendant of this span, not a sibling of the
             input, so `peer-checked:` has to reach into it explicitly —
             the plain variant compiles to a sibling combinator and would
             never match. */
          "peer-checked:[&>svg]:opacity-100",
          "peer-focus-visible:shadow-[0_0_0_3px_var(--quoin-ring)]",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3 text-on-accent opacity-0 transition-opacity"
        >
          <path d="m5 12 5 5L20 7" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && (
        <span className="nums shrink-0 text-micro text-faint">{count}</span>
      )}
    </label>
  );
}
