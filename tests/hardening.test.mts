import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — same setup as the other suites. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

/**
 * The guards added after the production audit.
 *
 * Three of these protect something that can lose money or let the wrong
 * caller in, and all three are the kind of thing that works on the day it
 * is written and quietly stops working later: an auth check that starts
 * accepting a prefix, a limiter whose window stops sliding, a JSON-LD
 * block that starts emitting unescaped markup. They are pure functions on
 * purpose so they can be tested without a database or a server.
 */

process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";

const { isAuthorizedCron } = await import("@/lib/cron");
const { check, rateLimitKey } = await import("@/lib/rate-limit");
const { absolute, breadcrumbSchema, productSchema } = await import("@/lib/seo");

function cronRequest(authorization?: string): Request {
  return new Request("https://quoin.example/api/v1/cron/reconcile-payments", {
    headers: authorization ? { authorization } : {},
  });
}

describe("cron authorization", () => {
  it("accepts the exact bearer secret", () => {
    assert.equal(isAuthorizedCron(cronRequest("Bearer cron-secret-for-tests-0123456789")), true);
  });

  it("refuses a missing header", () => {
    assert.equal(isAuthorizedCron(cronRequest()), false);
  });

  it("refuses the right secret under the wrong scheme", () => {
    assert.equal(isAuthorizedCron(cronRequest("cron-secret-for-tests-0123456789")), false);
    assert.equal(isAuthorizedCron(cronRequest("Basic cron-secret-for-tests-0123456789")), false);
  });

  it("refuses a prefix of the secret", () => {
    /* The failure mode a `startsWith` comparison would have. */
    assert.equal(isAuthorizedCron(cronRequest("Bearer cron-secret")), false);
  });

  it("refuses a secret with anything appended", () => {
    assert.equal(
      isAuthorizedCron(cronRequest("Bearer cron-secret-for-tests-0123456789x")),
      false,
    );
  });

  it("refuses everyone when no secret is configured", async () => {
    /* The important one: "not configured" must never mean "open". The
       module reads `env` at call time, so this needs a fresh import with
       the variable absent rather than a mutation of the live one. */
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const fresh = await import(`@/lib/cron?no-secret=${Date.now()}`);
    assert.equal(
      fresh.isAuthorizedCron(cronRequest("Bearer anything-at-all")),
      false,
    );
    assert.equal(fresh.isAuthorizedCron(cronRequest("Bearer ")), false);
    process.env.CRON_SECRET = saved;
  });
});

describe("rate limiting", () => {
  function headers(ip: string): Headers {
    return new Headers({ "x-forwarded-for": ip });
  }

  it("hashes the caller rather than keying on the raw address", () => {
    const key = rateLimitKey(headers("203.0.113.7"));
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.ok(!key.includes("203.0.113"));
  });

  it("reads only the first address from a forwarded chain", () => {
    /* Everything after the first hop is attacker-controllable, so keying
       on the whole header would hand out a fresh budget per request. */
    assert.equal(
      rateLimitKey(headers("203.0.113.7")),
      rateLimitKey(headers("203.0.113.7, 198.51.100.2, 192.0.2.9")),
    );
  });

  it("allows up to the bucket maximum and then refuses", () => {
    const key = `test-quote-${Math.random()}`;
    /* `quote` is 40 per minute. */
    for (let i = 0; i < 40; i++) {
      assert.equal(check("quote", key).allowed, true, `call ${i + 1} should pass`);
    }
    const refused = check("quote", key);
    assert.equal(refused.allowed, false);
    assert.ok(refused.retryAfterSeconds > 0);
  });

  it("keeps buckets independent, so one endpoint cannot spend another's budget", () => {
    const key = `test-split-${Math.random()}`;
    for (let i = 0; i < 40; i++) check("quote", key);
    assert.equal(check("quote", key).allowed, false);
    assert.equal(check("search", key).allowed, true);
  });

  it("counts callers separately", () => {
    const stamp = Math.random();
    for (let i = 0; i < 40; i++) check("quote", `a-${stamp}`);
    assert.equal(check("quote", `a-${stamp}`).allowed, false);
    assert.equal(check("quote", `b-${stamp}`).allowed, true);
  });
});

describe("structured data", () => {
  const variant = {
    id: "v1",
    label: "Standard",
    mrp: 500000,
    price: 415000,
    sku: "IWA-CHR-001",
    minQty: 1,
    stepQty: 1,
  };

  const product = {
    id: "p1",
    slug: "jaquar-bathtub",
    title: "Built-in Bathtub",
    brand: "Jaquar",
    categoryId: "c1",
    fulfilment: "scheduled" as const,
    pricingUnit: "per_piece" as const,
    variants: [{ ...variant, id: "v2", price: 480000, sku: "IWA-CHR-002" }, variant],
    badges: [],
    gstRatePct: 18,
    image: "swatch",
  };

  it("prices the offer from the cheapest variant, in rupees", () => {
    const schema = productSchema({ product, inStock: true }) as {
      offers: { price: string; priceCurrency: string; sku?: string };
      sku: string;
    };
    /* Paise in the database, a decimal string in the markup, and the
       cheaper of the two variants — which is what the page shows. */
    assert.equal(schema.offers.price, "4150.00");
    assert.equal(schema.offers.priceCurrency, "INR");
    assert.equal(schema.sku, "IWA-CHR-001");
  });

  it("declares the price as tax-inclusive", () => {
    /* Catalogue prices already contain GST. Without this a shopping
       surface is entitled to add the slab on top of a price that already
       has it. */
    const schema = productSchema({ product, inStock: true }) as {
      offers: { valueAddedTaxIncluded: boolean };
    };
    assert.equal(schema.offers.valueAddedTaxIncluded, true);
  });

  it("reports availability from what the page was told, not from a guess", () => {
    const out = productSchema({ product, inStock: false }) as {
      offers: { availability: string };
    };
    assert.equal(out.offers.availability, "https://schema.org/OutOfStock");
  });

  it("never passes a generated illustration off as product photography", () => {
    const illustrated = {
      ...product,
      photo: "/generated/thing.webp",
      photoIsIllustration: true,
    };
    assert.ok(!("image" in productSchema({ product: illustrated, inStock: true })));

    const photographed = { ...product, photo: "/catalogue/thing.jpg" };
    const schema = productSchema({ product: photographed, inStock: true }) as {
      image: string;
    };
    assert.ok(schema.image.endsWith("/catalogue/thing.jpg"));
    assert.ok(schema.image.startsWith("http"));
  });

  it("omits offers entirely for a product with no sellable variant", () => {
    /* Several hundred rows are in this state after a bad import. Claiming
       a price for one would be claiming a price that does not exist. */
    const schema = productSchema({ product: { ...product, variants: [] }, inStock: false });
    assert.ok(!("offers" in schema));
    assert.ok(!("sku" in schema));
  });

  it("numbers breadcrumb positions from one and absolutises every href", () => {
    const schema = breadcrumbSchema([
      { label: "Home", href: "/" },
      { label: "Bathware", href: "/c/bathware" },
    ]) as { itemListElement: { position: number; name: string; item: string }[] };

    assert.deepEqual(
      schema.itemListElement.map((i) => i.position),
      [1, 2],
    );
    assert.ok(schema.itemListElement[1].item.endsWith("/c/bathware"));
    assert.ok(schema.itemListElement[1].item.startsWith("http"));
  });

  it("builds absolute URLs against the configured origin", () => {
    assert.ok(absolute("/p/thing").startsWith("http"));
    assert.ok(absolute("/p/thing").endsWith("/p/thing"));
  });
});
