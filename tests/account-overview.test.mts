import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — see the same setup in
   tests/unit.test.mts. Only DATABASE_URL and AUTH_SECRET are required by
   the schema; both modules under test import `db`, which constructs (but
   does not connect) a PrismaClient at module load. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { greetingFor, todayIST, startOfMonthIST, firstName, plural } = await import(
  "@/lib/account/greeting"
);
const { projectProgressPct, pickNextService } = await import(
  "@/lib/data/account-overview"
);
const { contentTypeLabel } = await import("@/lib/data/documents");

describe("greetingFor", () => {
  it("greets morning before noon IST", () => {
    assert.equal(greetingFor(new Date("2026-01-15T00:00:00+05:30")), "Good morning");
    assert.equal(greetingFor(new Date("2026-01-15T11:59:00+05:30")), "Good morning");
  });

  it("greets afternoon from noon to 5pm IST", () => {
    assert.equal(greetingFor(new Date("2026-01-15T12:00:00+05:30")), "Good afternoon");
    assert.equal(greetingFor(new Date("2026-01-15T16:59:00+05:30")), "Good afternoon");
  });

  it("greets evening from 5pm IST", () => {
    assert.equal(greetingFor(new Date("2026-01-15T17:00:00+05:30")), "Good evening");
    assert.equal(greetingFor(new Date("2026-01-15T23:30:00+05:30")), "Good evening");
  });
});

describe("todayIST", () => {
  it("reads the IST calendar day, not the UTC one", () => {
    /* 19:00 UTC is 00:30 IST the next day. */
    assert.equal(todayIST(new Date("2026-01-15T19:00:00Z")), "2026-01-16");
    assert.equal(todayIST(new Date("2026-01-15T10:00:00Z")), "2026-01-15");
  });
});

describe("startOfMonthIST", () => {
  it("returns midnight IST on the 1st of the current IST month", () => {
    const now = new Date("2026-02-15T10:00:00+05:30");
    assert.equal(startOfMonthIST(now).getTime(), new Date("2026-02-01T00:00:00+05:30").getTime());
  });

  it("crosses a UTC month boundary the same way todayIST does", () => {
    /* 19:30 UTC on 31 Jan is 01:00 IST on 1 Feb — the IST month is
       already February even though the UTC instant is still January. */
    const now = new Date("2026-01-31T19:30:00Z");
    assert.equal(todayIST(now), "2026-02-01");
    assert.equal(startOfMonthIST(now).getTime(), new Date("2026-02-01T00:00:00+05:30").getTime());
  });
});

describe("firstName", () => {
  it("takes the trimmed first word", () => {
    assert.equal(firstName("  Vartika Sharma  "), "Vartika");
    assert.equal(firstName("Vartika"), "Vartika");
  });

  it("is null for nothing to greet", () => {
    assert.equal(firstName(null), null);
    assert.equal(firstName(undefined), null);
    assert.equal(firstName("   "), null);
    assert.equal(firstName(""), null);
  });
});

describe("plural", () => {
  it("picks the singular only for exactly one", () => {
    assert.equal(plural(1, "order", "orders"), "order");
    assert.equal(plural(0, "order", "orders"), "orders");
    assert.equal(plural(2, "order", "orders"), "orders");
    assert.equal(plural(-1, "order", "orders"), "orders");
  });
});

describe("projectProgressPct", () => {
  it("is null with no tasks — not 0%", () => {
    assert.equal(projectProgressPct([]), null);
  });

  it("rounds done-over-total to the nearest percent", () => {
    assert.equal(
      projectProgressPct([{ status: "TODO" }, { status: "DONE" }, { status: "DOING" }] as never),
      33,
    );
  });

  it("reaches the extremes", () => {
    assert.equal(projectProgressPct([{ status: "DONE" }, { status: "DONE" }] as never), 100);
    assert.equal(projectProgressPct([{ status: "TODO" }, { status: "DOING" }] as never), 0);
  });
});

describe("pickNextService", () => {
  it("is null with nothing upcoming", () => {
    assert.equal(pickNextService([]), null);
  });

  it("prefers the earliest scheduledAt over any preferredDate", () => {
    const scheduledLater = { id: "a", scheduledAt: "2026-09-20T05:00:00.000Z", preferredDate: null };
    const preferredEarlier = { id: "b", scheduledAt: null, preferredDate: "2026-09-18" };
    const scheduledEarliest = {
      id: "c",
      scheduledAt: "2026-09-17T10:00:00.000Z",
      preferredDate: null,
    };
    const result = pickNextService([scheduledLater, preferredEarlier, scheduledEarliest]);
    assert.equal(result?.id, "c");
  });

  it("sorts a booking with neither date last, never first", () => {
    const undated = { id: "undated", scheduledAt: null, preferredDate: null };
    const dated = { id: "dated", scheduledAt: null, preferredDate: "2026-09-18" };
    assert.equal(pickNextService([undated, dated])?.id, "dated");
    assert.equal(pickNextService([dated, undated])?.id, "dated");
  });

  it("does not crash when every row is undated", () => {
    const a = { id: "a", scheduledAt: null, preferredDate: null };
    const b = { id: "b", scheduledAt: null, preferredDate: null };
    const result = pickNextService([a, b]);
    assert.ok(result?.id === "a" || result?.id === "b");
  });
});

describe("contentTypeLabel", () => {
  it("names every accepted upload type", () => {
    assert.equal(contentTypeLabel("application/pdf"), "PDF");
    assert.equal(contentTypeLabel("image/png"), "Image");
    assert.equal(contentTypeLabel("image/jpeg"), "Image");
    assert.equal(contentTypeLabel("image/heic"), "Image");
    assert.equal(
      contentTypeLabel("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      "Spreadsheet",
    );
    assert.equal(contentTypeLabel("application/vnd.ms-excel"), "Spreadsheet");
    assert.equal(contentTypeLabel("text/csv"), "CSV");
  });

  it("falls back to File for anything unrecognised, rather than throwing", () => {
    assert.equal(contentTypeLabel("application/zip"), "File");
    assert.equal(contentTypeLabel(""), "File");
  });
});
