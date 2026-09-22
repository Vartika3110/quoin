import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — see tests/unit.test.mts for why these
   two are required even though nothing here touches auth or payments. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  SUPPORT_CATEGORY_SLUGS,
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_TONE,
  parseSupportCategory,
  defaultSubject,
} = await import("@/lib/data/support");
const { FAQ, SUPPORT_CATEGORIES } = await import("@/lib/support/faq");

describe("parseSupportCategory", () => {
  it("accepts every real slug", () => {
    for (const slug of SUPPORT_CATEGORY_SLUGS) {
      assert.equal(parseSupportCategory(slug), slug);
    }
  });

  it("returns undefined for anything that is not a real slug, rather than throwing", () => {
    for (const value of ["ORDERS", "order", "", "warranty", "orders "]) {
      assert.equal(parseSupportCategory(value), undefined);
    }
  });

  it("returns undefined for an absent value", () => {
    assert.equal(parseSupportCategory(undefined), undefined);
  });
});

describe("defaultSubject — order", () => {
  it("is a plain question by default", () => {
    assert.equal(
      defaultSubject({ orderReference: "QO-ABC234" }),
      "Help with order QO-ABC234",
    );
  });

  it("names it as an issue when type is 'issue'", () => {
    assert.equal(
      defaultSubject({ orderReference: "QO-ABC234", type: "issue" }),
      "Report an issue with order QO-ABC234",
    );
  });

  it("ignores a type other than 'issue'", () => {
    assert.equal(
      defaultSubject({ orderReference: "QO-ABC234", type: "question" }),
      "Help with order QO-ABC234",
    );
  });
});

describe("defaultSubject — booking", () => {
  it("is a plain question, and never carries the 'issue' phrasing an order can", () => {
    assert.equal(
      defaultSubject({ bookingReference: "QS-XYZ789" }),
      "Help with booking QS-XYZ789",
    );
    assert.equal(
      defaultSubject({ bookingReference: "QS-XYZ789", type: "issue" }),
      "Help with booking QS-XYZ789",
    );
  });
});

describe("defaultSubject — neither", () => {
  it("is empty when there is nothing to attach", () => {
    assert.equal(defaultSubject({}), "");
    assert.equal(defaultSubject({ type: "issue" }), "");
  });
});

describe("defaultSubject — both somehow present", () => {
  it("an order outranks a booking", () => {
    assert.equal(
      defaultSubject({ orderReference: "QO-ABC234", bookingReference: "QS-XYZ789" }),
      "Help with order QO-ABC234",
    );
  });
});

describe("support status vocabulary", () => {
  it("has a label and a tone for every SupportStatus value", () => {
    const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
    for (const status of statuses) {
      assert.equal(typeof SUPPORT_STATUS_LABEL[status], "string");
      assert.ok(SUPPORT_STATUS_LABEL[status].length > 0);
      assert.ok(["accent", "info", "success"].includes(SUPPORT_STATUS_TONE[status]));
    }
  });
});

describe("FAQ content", () => {
  it("has an entry in SUPPORT_CATEGORIES for every category slug, and vice versa", () => {
    const fromCategories = SUPPORT_CATEGORIES.map((c) => c.slug).sort();
    const fromSlugs = [...SUPPORT_CATEGORY_SLUGS].sort();
    assert.deepEqual(fromCategories, fromSlugs);
  });

  it("has 2-4 Q&As for every category, per the spec, each with real content", () => {
    for (const slug of SUPPORT_CATEGORY_SLUGS) {
      const entries = FAQ[slug];
      assert.ok(Array.isArray(entries), `FAQ.${slug} should be an array`);
      assert.ok(
        entries.length >= 2 && entries.length <= 4,
        `FAQ.${slug} has ${entries.length} entries, expected 2-4`,
      );
      for (const entry of entries) {
        assert.ok(entry.q.trim().length > 0);
        assert.ok(entry.a.trim().length > 0);
      }
    }
  });

  it("never promises a refund or delivery timeline, or a response-time guarantee", () => {
    /* Cheap guard against the exact thing `AGENTS.md` and this file's own
       header comment forbid creeping back in during a later edit. Not
       exhaustive — it cannot catch every way to imply a promise — but it
       catches the obvious regression: someone adding "within 24 hours" or
       "3-5 business days" to an answer. */
    const bannedPhrases = [
      "within 24 hours",
      "within 48 hours",
      "business days",
      "working days",
      "hours of receiving",
    ];
    for (const slug of SUPPORT_CATEGORY_SLUGS) {
      for (const entry of FAQ[slug]) {
        const text = entry.a.toLowerCase();
        for (const phrase of bannedPhrases) {
          assert.ok(!text.includes(phrase), `FAQ.${slug} answer "${entry.q}" reads like a timeline promise`);
        }
      }
    }
  });
});
