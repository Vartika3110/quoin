import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { encodeRow, decodeRow, encodeValue, decodeValue } = await import("@/lib/backup/serialise");

/**
 * The part of a backup that fails silently.
 *
 * A `Date` that stringifies to `{}`, a `BigInt` that throws, a `Bytes`
 * column that becomes "[object Object]" — none of those announce
 * themselves. They produce an export that looks fine until the morning
 * somebody restores from it. So the round trip is asserted here rather
 * than trusted.
 */

describe("a row survives the round trip", () => {
  it("brings a date back as a date, to the millisecond", () => {
    /* The one JSON cannot do, and the one every row has. */
    const when = new Date("2026-10-05T11:22:33.456Z");
    const back = decodeRow(encodeRow({ createdAt: when })) as { createdAt: Date };
    assert.ok(back.createdAt instanceof Date);
    assert.equal(back.createdAt.getTime(), when.getTime());
  });

  it("does not let a date decay into a string", () => {
    /* `JSON.stringify` with a replacer cannot catch this: `toJSON` has
       already run by the time a replacer sees the value, so the date is
       a string before the hook fires. Hence walking the value instead. */
    const encoded = JSON.parse(encodeRow({ at: new Date("2026-01-02T03:04:05.000Z") }));
    assert.deepEqual(encoded.at, { $t: "date", v: "2026-01-02T03:04:05.000Z" });
  });

  it("keeps a bigint exact past what a double can hold", () => {
    /* `BigInt("…")` rather than the `n` literal: the test suite's
       target predates them, and the point here is the value, not the
       syntax. Number.MAX_SAFE_INTEGER + 2, which a double cannot hold. */
    const huge = BigInt("9007199254740993");
    const back = decodeRow(encodeRow({ n: huge })) as { n: bigint };
    assert.equal(back.n, huge);
    assert.equal(typeof back.n, "bigint");
  });

  it("carries bytes through base64 rather than an array of numbers", () => {
    const bytes = Buffer.from([0, 1, 250, 255]);
    const encoded = JSON.parse(encodeRow({ blob: bytes }));
    assert.equal(encoded.blob.$t, "bytes");
    const back = decodeRow(encodeRow({ blob: bytes })) as { blob: Buffer };
    assert.deepEqual([...back.blob], [0, 1, 250, 255]);
  });

  it("writes a decimal as its printed string, never as a float", () => {
    /* Prisma's Decimal is any object with `toFixed`. Money turned into
       a double to write it down is the failure this file exists for. */
    const decimalish = { toFixed: () => "0", toString: () => "1234.56" };
    const encoded = JSON.parse(encodeRow({ amount: decimalish }));
    assert.deepEqual(encoded.amount, { $t: "decimal", v: "1234.56" });
    assert.equal(decodeValue(encoded.amount), "1234.56");
  });

  it("leaves ordinary values alone", () => {
    const row = { id: "cmv1", qty: 3, live: true, note: null, tags: ["a", "b"] };
    assert.deepEqual(decodeRow(encodeRow(row)), row);
  });

  it("reaches into nested objects and arrays", () => {
    const when = new Date("2026-03-04T05:06:07.000Z");
    const row = { lines: [{ at: when, meta: { seen: [when] } }] };
    const back = decodeRow(encodeRow(row)) as { lines: { at: Date; meta: { seen: Date[] } }[] };
    assert.ok(back.lines[0].at instanceof Date);
    assert.ok(back.lines[0].meta.seen[0] instanceof Date);
  });

  it("treats undefined as null, because a column is one or the other", () => {
    assert.equal(encodeValue(undefined), null);
    assert.deepEqual(JSON.parse(encodeRow({ a: undefined })), { a: null });
  });

  it("does not mistake a JSON column's own data for a tag", () => {
    /* The schema has a Json column (`StudioIdea.colors`), and a value
       in one could look exactly like this file's own tagging. Without
       escaping, it would be read back as an Invalid Date — a restore
       that changes data rather than failing. */
    const row = { payload: { $t: "date", v: "not really" } };
    const back = decodeRow(encodeRow(row)) as { payload: Record<string, unknown> };
    assert.equal(back.payload instanceof Date, false);
    assert.deepEqual(back.payload, { $t: "date", v: "not really" });
  });

  it("escapes its own escape, so the trick cannot be used against it", () => {
    const row = { payload: { $esc: { $t: "bigint", v: "1" } } };
    assert.deepEqual(decodeRow(encodeRow(row)), row);
  });

  it("leaves a real JSON array of colours exactly as it was", () => {
    const row = { colors: ["#2a160a", "#d8b28b"] };
    assert.deepEqual(decodeRow(encodeRow(row)), row);
  });
});
