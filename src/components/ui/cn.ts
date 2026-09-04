/**
 * Joins class names, dropping anything falsy.
 *
 * Deliberately not `tailwind-merge`. Merging exists to resolve conflicts
 * between a component's own classes and a caller's override, and the
 * components in this directory avoid that problem at the source: every one
 * of them puts `className` last, so a caller's utility already wins by CSS
 * order. Paying 6kB and a parse of every class string to solve a problem
 * the API shape already solves is not a trade worth making.
 */
export function cn(...parts: ClassValue[]): string {
  /* Only strings survive. The wider input type exists so that
     `someReactNode && "mb-4"` type-checks — a ReactNode narrows to `0` or
     `""` when falsy — and those values must not reach the class list. */
  return parts.filter((p): p is string => typeof p === "string" && p !== "").join(" ");
}

/**
 * Anything a `&&` guard can produce. Deliberately not `unknown`: an object
 * or an array passed here is a mistake, and the type should say so rather
 * than silently dropping it at runtime.
 */
type ClassValue = string | number | bigint | boolean | null | undefined;
