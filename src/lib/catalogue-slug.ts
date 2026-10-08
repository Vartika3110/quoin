/**
 * Slug derivation for catalogue rows.
 *
 * The two importers and the rebranding script all assign slugs, and all
 * three must agree: a slug is a URL, and a URL that changes between one
 * import and the next is a URL that has been indexed and then broken.
 * They previously carried private, near-identical copies of these two
 * functions; this is the one copy they now share.
 *
 * Deliberately free of `db`, `env` and Prisma imports. Those scripts run
 * under `tsx`, outside Next.js, and importing the app's env validation
 * as a side effect would fail them before they had parsed their own
 * arguments. Keep this module dependency-free.
 */

/**
 * A URL-safe slug from a product, brand or category name.
 *
 * NFKD splits an accented letter into its base plus a combining mark,
 * and the combining marks are then dropped rather than left to the
 * `[^a-z0-9]` pass, which would turn each one into a stray hyphen:
 * "Café" is "cafe", not "cafe-".
 */
export function slugifyProduct(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

/**
 * The first slug not already in `taken`, truncated to `maxLength`.
 *
 * Distinct names routinely collapse onto one slug — "Dr Fixit" and
 * "Dr. Fixit" are different brands that both slugify to "dr-fixit" — so
 * a numeric suffix is appended until one is free.
 *
 * Pure: `taken` is read, never added to. A caller assigning many slugs
 * in one pass must record each result itself, or it will hand out the
 * same slug twice.
 */
export function firstFreeSlug(base: string, maxLength: number, taken: Set<string>): string {
  return firstFreeValue(slugifyProduct(base), maxLength, taken);
}

/**
 * The same suffixing, for a value that must not be slugified.
 *
 * Variant SKUs are the case: `reserveVariantSku` derives one from the
 * product's own code, and those are upper-case manufacturer codes.
 * Putting them through `slugifyProduct` first would quietly turn
 * `CEMAMBCEMN50G7-STD` into `cemambcemn50g7-std` — still unique, still
 * stored, and no longer the code printed on the box.
 *
 * Shared with `firstFreeSlug` rather than copied, because the suffixing
 * rule is the thing that was duplicated three ways before this module
 * existed, and a second copy of it here would start that again.
 */
export function firstFreeValue(root: string, maxLength: number, taken: Set<string>): string {
  const base = root.slice(0, maxLength);
  let candidate = base;
  let n = 1;

  while (taken.has(candidate)) {
    n += 1;
    const suffix = `-${n}`;
    candidate = `${base.slice(0, maxLength - suffix.length)}${suffix}`;
  }

  return candidate;
}
