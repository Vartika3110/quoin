import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and src/lib/data/projects.ts pulls in
   `db` (src/lib/db.ts), which pulls in `env`. Same shim as
   tests/admin-metrics.test.mts — set before the first import that
   touches it. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  isCalendarDay,
  toCalendarDate,
  fromCalendarDate,
  PROJECT_KIND_TO_DB,
  PROJECT_KIND_FROM_DB,
  PROJECT_KINDS,
  TASK_STATUS_TO_DB,
  TASK_STATUS_FROM_DB,
  MATERIAL_STATUS_TO_DB,
  MATERIAL_STATUS_FROM_DB,
} = await import("@/lib/data/projects");

describe("isCalendarDay", () => {
  it("accepts a real calendar day", () => {
    assert.equal(isCalendarDay("2026-09-04"), true);
    assert.equal(isCalendarDay("2024-02-29"), true); // leap year
  });

  it("rejects a day that does not exist, rather than letting Date normalise it", () => {
    // JS's own parser rolls 30 Feb forward into 2 March — silently wrong
    // for a project's start date. isCalendarDay must catch what Date lets
    // through.
    assert.equal(isCalendarDay("2026-02-30"), false);
    assert.equal(isCalendarDay("2023-02-29"), false); // not a leap year
    assert.equal(isCalendarDay("2026-13-01"), false);
    assert.equal(isCalendarDay("2026-00-10"), false);
  });

  it("rejects anything not shaped like YYYY-MM-DD", () => {
    assert.equal(isCalendarDay("2026-9-4"), false);
    assert.equal(isCalendarDay("04-09-2026"), false);
    assert.equal(isCalendarDay("2026-09-04T00:00:00Z"), false);
    assert.equal(isCalendarDay(""), false);
  });
});

describe("toCalendarDate / fromCalendarDate", () => {
  it("round-trips a day exactly, at a boundary that would shift under a local timezone", () => {
    // 1 January and 31 December are the two days a timezone offset either
    // side of UTC would push into a different month, or a different year
    // entirely — the sharpest boundary this pair of functions has.
    for (const day of ["2026-01-01", "2026-12-31", "2026-09-04"]) {
      assert.equal(fromCalendarDate(toCalendarDate(day)), day);
    }
  });

  it("stores midnight UTC, not local midnight", () => {
    const date = toCalendarDate("2026-09-04");
    assert.equal(date.toISOString(), "2026-09-04T00:00:00.000Z");
  });

  it("never shifts a date backward, which toISOString().slice(0,10) alone would do east of UTC", () => {
    // A naive `new Date("2026-09-04")` interpreted in a timezone east of
    // UTC (e.g. IST) and then re-read with a *local* formatter would read
    // back as 3 September. Going through toCalendarDate/fromCalendarDate
    // must not reproduce that bug regardless of the host's local TZ.
    const day = "2026-09-04";
    const roundTripped = fromCalendarDate(toCalendarDate(day));
    assert.equal(roundTripped, day);
  });
});

describe("project kind mapping", () => {
  it("round-trips every kind through the DB representation and back", () => {
    for (const kind of PROJECT_KINDS) {
      assert.equal(PROJECT_KIND_FROM_DB[PROJECT_KIND_TO_DB[kind]], kind);
    }
  });

  it("is exhaustive over the DB enum in both directions", () => {
    assert.equal(Object.keys(PROJECT_KIND_TO_DB).length, PROJECT_KINDS.length);
    assert.equal(Object.keys(PROJECT_KIND_FROM_DB).length, PROJECT_KINDS.length);
  });

  it("maps the values the schema actually stores", () => {
    assert.equal(PROJECT_KIND_TO_DB.new_home, "NEW_HOME");
    assert.equal(PROJECT_KIND_TO_DB.commercial, "COMMERCIAL");
    assert.equal(PROJECT_KIND_FROM_DB.NEW_HOME, "new_home");
  });
});

describe("task status mapping", () => {
  it("round-trips every status", () => {
    for (const status of ["todo", "doing", "done"] as const) {
      assert.equal(TASK_STATUS_FROM_DB[TASK_STATUS_TO_DB[status]], status);
    }
  });
});

describe("material status mapping", () => {
  it("round-trips every status", () => {
    for (const status of ["planned", "ordered", "delivered"] as const) {
      assert.equal(MATERIAL_STATUS_FROM_DB[MATERIAL_STATUS_TO_DB[status]], status);
    }
  });
});
