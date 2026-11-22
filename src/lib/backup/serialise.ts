/**
 * Turning a database row into a line of text, and back.
 *
 * Pure, and separate from the script that writes the files, because
 * this is the part that silently loses data if it is wrong. A `Date`
 * that stringifies to `{}`, a `BigInt` that throws, a `Bytes` column
 * that comes back as `[object Object]` — none of those fail loudly.
 * They produce a backup that looks fine until the day somebody tries
 * to restore from it, which is the worst possible day to find out.
 *
 * Every value is tagged with its type on the way out, so the reader
 * does not have to guess on the way back in. `"2026-11-22"` is a
 * perfectly good string *and* a perfectly good date, and a restore that
 * guesses gets it wrong half the time.
 */

/** A value as it is written to disk. Primitives stay primitive. */
type Tagged =
  | { $t: "date"; v: string }
  | { $t: "bigint"; v: string }
  | { $t: "bytes"; v: string }
  | { $t: "decimal"; v: string };

function isTagged(value: unknown): value is Tagged {
  return typeof value === "object" && value !== null && "$t" in value && "v" in value;
}

/**
 * JSON for one row, with the types that JSON does not have preserved.
 *
 * Not `JSON.stringify(row, replacer)`: a replacer sees a `Date` *after*
 * `toJSON` has already turned it into a string, so the one type most
 * worth preserving is the one a replacer cannot catch. This walks the
 * value itself.
 */
export function encodeRow(row: unknown): string {
  return JSON.stringify(encodeValue(row));
}

export function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return { $t: "date", v: value.toISOString() } satisfies Tagged;
  }
  if (typeof value === "bigint") {
    return { $t: "bigint", v: value.toString() } satisfies Tagged;
  }
  /* `Buffer` in Node, `Uint8Array` everywhere else — Prisma hands back
     either depending on the driver. Base64 rather than an array of
     numbers: a 2KB blob is 2,000 JSON integers otherwise. */
  if (value instanceof Uint8Array) {
    return { $t: "bytes", v: Buffer.from(value).toString("base64") } satisfies Tagged;
  }
  /* Prisma's `Decimal` is an object with its own `toFixed`. Stored as
     the string it prints, because turning money into a float to write
     it down is the one thing this file exists to prevent. */
  if (
    typeof value === "object" &&
    value !== null &&
    "toFixed" in value &&
    typeof (value as { toFixed: unknown }).toFixed === "function" &&
    !(value instanceof Number)
  ) {
    return { $t: "decimal", v: String(value) } satisfies Tagged;
  }

  if (Array.isArray(value)) return value.map(encodeValue);

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = encodeValue(inner);
    /* A JSON column can legitimately hold `{ "$t": "date" }` — the
       schema has one (`StudioIdea.colors`), and nothing stops a future
       one holding whatever a supplier's feed contained. Without this,
       such a value would be read back as a date, which is a restore
       that silently changes data rather than failing.

       Any object carrying a `$`-prefixed key is wrapped in `$esc` and
       unwrapped on the way back. The wrapper itself starts with `$`, so
       an object that really does contain `$esc` is escaped again by the
       same rule, which terminates. */
    return Object.keys(out).some((key) => key.startsWith("$")) ? { $esc: out } : out;
  }

  return value;
}

/** The inverse, for a restore or a verification read. */
export function decodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  /* The escape hatch above, undone before anything else looks at it.
     The wrapped object's *entries* are decoded, not the object itself:
     passing it back through `decodeValue` whole would hand it to the
     tag check on the next line, which is exactly the misreading the
     wrapper exists to prevent. */
  if (
    typeof value === "object" &&
    value !== null &&
    "$esc" in value &&
    Object.keys(value).length === 1
  ) {
    const inner = (value as { $esc: Record<string, unknown> }).$esc;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(inner)) out[key] = decodeValue(entry);
    return out;
  }

  if (isTagged(value)) {
    switch (value.$t) {
      case "date":
        return new Date(value.v);
      case "bigint":
        return BigInt(value.v);
      case "bytes":
        return Buffer.from(value.v, "base64");
      case "decimal":
        /* Left as a string. Only Prisma can make it a `Decimal` again,
           and a reader that wants a number can say so — turning it into
           one here would undo the point of writing it as a string. */
        return value.v;
    }
  }

  if (Array.isArray(value)) return value.map(decodeValue);

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = decodeValue(inner);
    return out;
  }

  return value;
}

export function decodeRow(line: string): unknown {
  return decodeValue(JSON.parse(line));
}
