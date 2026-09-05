import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and otp.ts pulls AUTH_SECRET from it. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

/* Here rather than beside the payments imports below, because `env` is a
   module-level constant: it snapshots `process.env` the first time
   anything imports it, and the OTP import a few lines down does exactly
   that. Set after it and the signature helpers see no secret and reject
   everything — including the deliveries these tests prove they accept. */
process.env.RAZORPAY_KEY_SECRET ??= "rzp_test_secret_for_unit_tests";
process.env.RAZORPAY_WEBHOOK_SECRET ??= "webhook_secret_for_unit_tests";

const { normalizePhone, maskPhone, InvalidPhoneError } = await import(
  "@/lib/auth/phone"
);
const { generateCode, hashCode, verifyCode, OTP_LENGTH } = await import(
  "@/lib/auth/otp"
);
const { haversineKm, resolveServiceability } = await import("@/lib/geo");
const { normalizeQty, areaFromDimensions, applyWastage, lineTotal } =
  await import("@/lib/cart/quantity");
const { resolvePrice, resolveVariantPrice, proSaving, formatPrice } =
  await import("@/lib/types/catalog");
const { istDay, addDays, formatConsultDay } = await import("@/lib/types/consult");
const { parseParcha } = await import("@/lib/parcha");
const { categorySlugsForTerm } = await import("@/lib/data/search");
const { BRAND_WALL } = await import("@/lib/brand-logos");

const { taxForLine, canTransition, CALLBACK_RESERVATION_WINDOW_MS } =
  await import("@/lib/data/orders");
const {
  resolveOrderPage,
  DEFAULT_ORDER_PAGE_SIZE,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
} = await import("@/lib/data/order-history");
const { verifyWebhookSignature, verifyCheckoutSignature } = await import(
  "@/lib/payments/razorpay"
);
const {
  availableQty,
  movementDelta,
  isStockBearing,
  linesRequiringStock,
  resolveStoreForStockLine,
  RESERVATION_WINDOW_MS,
} = await import("@/lib/data/inventory");
const { basketKey } = await import(
  "@/components/storefront/checkout/idempotency"
);
const { createHmac } = await import("node:crypto");
type CatalogProduct = import("@/lib/types/catalog").Product;
type OrderStatus = import("@prisma/client").OrderStatus;
type Fulfilment = import("@prisma/client").Fulfilment;

/**
 * Fixtures live here rather than in the data layer, which now reads the
 * catalogue from Postgres. These two exercise every branch the pure
 * pricing and quantity functions have: multiple variants with and without
 * a Pro rate, and a minimum/step grid that is not 1/1.
 */
const MARBLE: CatalogProduct = {
  id: "p_marble",
  slug: "italian-marble-statuario",
  title: "Italian Marble Statuario",
  brand: "Quoin Select",
  categoryId: "c_construction",
  fulfilment: "made_to_order",
  pricingUnit: "per_sqft",
  badges: ["premium_quality"],
  image: "marble",
  leadTimeDays: 7,
  variants: [
    {
      id: "v_statuario_16",
      label: "16mm slab",
      mrp: 18900,
      price: 14900,
      proPrice: 13400,
      sku: "MAT-MRB-ST16",
      /* Sold by the slab, not the square foot — a 20 sq.ft. minimum
         prevents orders that cannot physically be cut. */
      minQty: 20,
      stepQty: 5,
    },
    {
      id: "v_statuario_20",
      label: "20mm slab",
      mrp: 22900,
      price: 18900,
      proPrice: 17000,
      sku: "MAT-MRB-ST20",
      minQty: 20,
      stepQty: 5,
    },
  ],
};

const PAINT: CatalogProduct = {
  id: "p_paint",
  slug: "asian-paints-royale-luxury-emulsion",
  title: "Asian Paints Royale Luxury Emulsion",
  brand: "Asian Paints",
  categoryId: "c_construction",
  fulfilment: "instant",
  pricingUnit: "per_litre",
  badges: ["top_brand"],
  image: "paint",
  variants: [
    { id: "v_royale_1l", label: "1 L", mrp: 19900, price: 15500, sku: "PNT-RYL-1L", minQty: 1, stepQty: 1 },
    { id: "v_royale_4l", label: "4 L", mrp: 72900, price: 58900, proPrice: 54900, sku: "PNT-RYL-4L", minQty: 1, stepQty: 1 },
    { id: "v_royale_10l", label: "10 L", mrp: 169900, price: 139900, proPrice: 129900, sku: "PNT-RYL-10L", minQty: 1, stepQty: 1 },
  ],
};

describe("phone normalisation", () => {
  it("collapses every Indian input format onto one E.164 value", () => {
    for (const input of [
      "9876543210",
      "09876543210",
      "+919876543210",
      "919876543210",
      "+91 98765-43210",
      "  98765 43210  ",
    ]) {
      assert.equal(normalizePhone(input), "+919876543210", input);
    }
  });

  it("rejects numbers that cannot be Indian mobiles", () => {
    for (const bad of ["", "12345", "1234567890", "5876543210", "98765432101"]) {
      assert.throws(() => normalizePhone(bad), InvalidPhoneError, bad);
    }
  });

  it("masks all but the last five digits", () => {
    assert.equal(maskPhone("+919876543210"), "+91 ***** 43210");
  });
});

describe("otp", () => {
  it("generates codes of the right length, including leading zeros", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      assert.equal(code.length, OTP_LENGTH);
      assert.match(code, /^\d+$/);
    }
  });

  it("verifies a correct code and rejects a wrong one", () => {
    const phone = "+919876543210";
    const hash = hashCode(phone, "123456");
    assert.ok(verifyCode(phone, "123456", hash));
    assert.ok(!verifyCode(phone, "123457", hash));
  });

  it("will not accept a code minted for a different phone", () => {
    /* The phone is bound into the HMAC precisely to stop this replay. */
    const hash = hashCode("+919876543210", "123456");
    assert.ok(!verifyCode("+919999999999", "123456", hash));
  });

  it("never stores the code itself", () => {
    assert.ok(!hashCode("+919876543210", "123456").includes("123456"));
  });
});

describe("serviceability", () => {
  const vasantVihar = { lat: 28.5601, lng: 77.1591 };
  const stores = [
    {
      id: "s1",
      code: "DEL-VV",
      name: "Quoin South Delhi",
      lat: 28.5601,
      lng: 77.1591,
      serviceRadiusKm: 6,
      baseEtaMinutes: 18,
    },
    {
      id: "s2",
      code: "DEL-OKH",
      name: "Quoin Okhla",
      lat: 28.5355,
      lng: 77.2731,
      serviceRadiusKm: 7,
      baseEtaMinutes: 22,
    },
  ];

  it("measures a known distance to within a few percent", () => {
    /* Vasant Vihar to Okhla is roughly 11 km as the crow flies. */
    const km = haversineKm(vasantVihar, { lat: 28.5355, lng: 77.2731 });
    assert.ok(km > 10 && km < 12, `got ${km}`);
  });

  it("picks the nearest store that can actually reach the point", () => {
    const r = resolveServiceability(vasantVihar, stores);
    assert.equal(r.serviceable, true);
    assert.equal(r.store?.code, "DEL-VV");
    assert.equal(r.distanceKm, 0);
    assert.equal(r.etaMinutes, 18);
  });

  it("reports not serviceable outside every radius", () => {
    /* Jaipur — far outside any Delhi store. */
    const r = resolveServiceability({ lat: 26.9124, lng: 75.7873 }, stores);
    assert.equal(r.serviceable, false);
    assert.equal(r.store, null);
    assert.equal(r.etaMinutes, null);
  });

  it("quotes a longer eta the further out the customer is", () => {
    const near = resolveServiceability(vasantVihar, stores).etaMinutes!;
    const far = resolveServiceability(
      { lat: 28.5901, lng: 77.1891 },
      stores,
    ).etaMinutes!;
    assert.ok(far > near, `${far} should exceed ${near}`);
  });
});

describe("quantity grid", () => {
  const variant = MARBLE.variants[0]; // min 20, step 5

  it("never sells below the minimum", () => {
    assert.equal(normalizeQty(variant, 0), 20);
    assert.equal(normalizeQty(variant, 19), 20);
    assert.equal(normalizeQty(variant, -5), 20);
  });

  it("rounds up onto the step, never down", () => {
    /* Rounding down would leave the customer short on site. */
    assert.equal(normalizeQty(variant, 21), 25);
    assert.equal(normalizeQty(variant, 25), 25);
    assert.equal(normalizeQty(variant, 26), 30);
  });

  it("survives garbage input", () => {
    assert.equal(normalizeQty(variant, NaN), 20);
    assert.equal(normalizeQty(variant, Infinity), 20);
  });

  it("computes the area shown on the product page", () => {
    const area = areaFromDimensions(10, 12);
    assert.equal(area, 120);
    assert.equal(applyWastage(area, true), 132);
    assert.equal(applyWastage(area, false), 120);
    assert.equal(normalizeQty(variant, 132), 135);
  });

  it("treats impossible dimensions as no area", () => {
    assert.equal(areaFromDimensions(0, 12), 0);
    assert.equal(areaFromDimensions(-3, 12), 0);
    assert.equal(areaFromDimensions(NaN, 12), 0);
  });
});

describe("price resolution", () => {
  const marble = MARBLE;
  const paint = PAINT;

  it("shows the cheapest variant, flagged as a from-price", () => {
    const p = resolvePrice(paint, false);
    assert.equal(p.amount, 15500);
    assert.equal(p.isFrom, true);
  });

  it("charges Pro members the trade rate", () => {
    const standard = resolveVariantPrice(marble.variants[0], false);
    const pro = resolveVariantPrice(marble.variants[0], true);
    assert.equal(standard.amount, 14900);
    assert.equal(pro.amount, 13400);
    assert.equal(pro.isProPrice, true);
  });

  it("reports no Pro saving where no trade rate exists", () => {
    const oneLitre = paint.variants.find((v) => v.label === "1 L")!;
    assert.equal(proSaving(oneLitre), null);
  });

  it("matches the total rendered on the marble page", () => {
    /* 10ft x 12ft +10% -> 135 sq.ft. at Rs.149 = Rs.20,115. */
    const price = resolveVariantPrice(marble.variants[0], false);
    assert.equal(lineTotal(price.amount, 135), 2011500);
    assert.equal(formatPrice(2011500), "₹20,115");
  });

  it("groups rupees the Indian way", () => {
    assert.equal(formatPrice(100000000), "₹10,00,000");
  });
});

describe("consultation days", () => {
  /**
   * The whole reason `istDay` exists. Half of every Indian day is the
   * previous day in UTC, so the obvious `toISOString().slice(0, 10)` books
   * a customer who asks for "today" just after midnight onto yesterday —
   * a date the API then rejects as being in the past.
   */
  it("reads the calendar day in India, not in UTC", () => {
    const justAfterMidnightIST = new Date("2026-08-29T18:35:00Z");
    assert.equal(justAfterMidnightIST.toISOString().slice(0, 10), "2026-08-29");
    assert.equal(istDay(justAfterMidnightIST), "2026-08-30");
  });

  it("does not roll the day over early", () => {
    /* 23:59 IST on the 29th is still the 29th. */
    assert.equal(istDay(new Date("2026-08-29T18:29:00Z")), "2026-08-29");
  });

  it("steps whole days across a month boundary", () => {
    assert.equal(addDays("2026-08-29", 0), "2026-08-29");
    assert.equal(addDays("2026-08-29", 3), "2026-09-01");
    assert.equal(addDays("2026-08-29", 14), "2026-09-12");
  });

  it("steps across a leap day", () => {
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2028-02-28", 2), "2028-03-01");
  });

  /* The chip label must name the day the customer picked, whatever the
     timezone of the machine rendering it. */
  it("labels a day without shifting it", () => {
    assert.equal(formatConsultDay("2026-09-01"), "Tue, 1 Sept");
  });
});

/* ------------------------------------------------------------------ parcha */

describe("parcha parsing", () => {
  it("reads a quantity written after the name", () => {
    const [line] = parseParcha("Cement 40 bags");
    assert.equal(line.term, "Cement");
    assert.equal(line.qty, 40);
    assert.equal(line.unit, "bags");
  });

  it("reads a quantity written before the name", () => {
    const [line] = parseParcha("40 bags cement");
    assert.equal(line.term, "cement");
    assert.equal(line.qty, 40);
    assert.equal(line.unit, "bags");
  });

  it("reads a multiplier written as x", () => {
    const [line] = parseParcha("12 x floor spring");
    assert.equal(line.term, "floor spring");
    assert.equal(line.qty, 12);
  });

  it("keeps a size that is part of the product name", () => {
    /* The number and the word after it are the product, not an order of
       twenty. Losing this is how "8 inch pipe" becomes "8 of pipe". */
    const [line] = parseParcha("Pipe 20 mm");
    assert.equal(line.term, "Pipe 20 mm");
    assert.equal(line.qty, 1);
    assert.equal(line.unit, null);
  });

  it("does not take a leading size as a quantity", () => {
    const [line] = parseParcha("8 inch CPVC bend");
    assert.equal(line.term, "8 inch CPVC bend");
    assert.equal(line.qty, 1);
  });

  it("splits on commas as well as newlines", () => {
    const lines = parseParcha("Cement 40 bags, White paint 18 ltr");
    assert.equal(lines.length, 2);
    assert.equal(lines[1].term, "White paint");
    assert.equal(lines[1].unit, "litres");
  });

  it("strips bullets and serial numbers", () => {
    const lines = parseParcha("1. Cement 40 bags\n- Steel 250 kg\n• Tiles 620 sqft");
    assert.deepEqual(
      lines.map((l) => l.term),
      ["Cement", "Steel", "Tiles"],
    );
    assert.deepEqual(
      lines.map((l) => l.unit),
      ["bags", "kg", "sq.ft."],
    );
  });

  it("drops blank lines and fragments too short to search", () => {
    assert.equal(parseParcha("\n\n  \n-\n").length, 0);
  });

  it("defaults a missing quantity to one", () => {
    const [line] = parseParcha("Jaquar shower head");
    assert.equal(line.qty, 1);
    assert.equal(line.unit, null);
  });
});

/* ------------------------------------------------------- search synonyms */

describe("plain-language category matching", () => {
  it("maps a room to the department that actually holds it", () => {
    /* The catalogue calls this "Bathware & plumbing". A customer does
       not. Without the map, the largest department on the site is
       unreachable by its most obvious search term. */
    assert.ok(categorySlugsForTerm("bathroom").includes("bathware-plumbing"));
    assert.ok(categorySlugsForTerm("kitchen").includes("kitchen-sinks-faucets"));
    assert.ok(categorySlugsForTerm("wiring").includes("electricals-lighting"));
    assert.ok(categorySlugsForTerm("false ceiling").includes("gypsum-false-ceiling"));
  });

  it("matches whole words, not fragments", () => {
    /* "bathe" shares four letters with "bath" and means something else. */
    assert.deepEqual(categorySlugsForTerm("bathe"), []);
    assert.deepEqual(categorySlugsForTerm("ti"), []);
  });

  it("lets one term reach several departments", () => {
    /* Hinges are genuinely both cabinet hardware and door hardware. */
    const hinge = categorySlugsForTerm("hinge");
    assert.ok(hinge.length > 1, `expected several, got ${hinge.join(", ")}`);
  });

  it("finds the department inside a longer phrase", () => {
    assert.ok(
      categorySlugsForTerm("bathroom fittings").includes("bathware-plumbing"),
    );
  });

  it("returns nothing for a term too short to mean anything", () => {
    assert.deepEqual(categorySlugsForTerm("a"), []);
    assert.deepEqual(categorySlugsForTerm(""), []);
  });
});

/* ----------------------------------------------------------------- GST */

describe("GST on an order line", () => {
  it("extracts the slab out of the line, never adds it on top", () => {
    /* A ₹1,000 item on the 18% slab is ₹1,00,000 paise. GST already
       inside it is ₹1,52.54 — an inclusive extraction, not the ₹180 an
       additive 18% would charge on top. */
    const tax = taxForLine(100_000, 18);
    assert.equal(tax, 15_254);
    assert.ok(tax < 18_000, "an inclusive read must extract less than an additive 18% would add");
  });

  it("extracts the 28% cement slab correctly", () => {
    /* Chosen so the arithmetic is checkable by hand: a ₹1,000 net item on
       the 28% slab sells inclusive at ₹1,280, and 28/128 of that is
       exactly ₹280 — the extraction recovers the net price exactly. */
    assert.equal(taxForLine(128_000, 28), 28_000);
  });

  it("charges nothing at a zero slab", () => {
    assert.equal(taxForLine(99_999, 0), 0);
  });

  it("stays on whole paise", () => {
    /* An odd amount does not divide evenly by (100 + rate) — the result
       still has to land on an integer or the order total stops being a
       number Razorpay will accept. */
    const tax = taxForLine(1, 5);
    assert.ok(Number.isInteger(tax), `expected an integer, got ${tax}`);
    assert.equal(tax, 0);
    assert.equal(taxForLine(333, 18), 51);
  });

  it("taxes each line separately rather than the subtotal", () => {
    /* A basket spanning two slabs has no single rate that could be
       applied to its total, which is the whole reason this is per-line —
       and unlike an additive tax, the two lines don't even share a
       common base to blend: extracting from a 28% line and extracting
       from a 5% line divide by different denominators. */
    const cement = taxForLine(50_000, 28);
    const sand = taxForLine(50_000, 5);
    assert.notEqual(cement, sand);
    assert.notEqual(cement + sand, taxForLine(100_000, 18));
  });
});

describe("order lifecycle transitions", () => {
  it("allows every legal edge in the machine", () => {
    const edges: [OrderStatus, OrderStatus][] = [
      ["PENDING_PAYMENT", "PAID"],
      ["PENDING_PAYMENT", "FAILED"],
      ["PENDING_PAYMENT", "CANCELLED"],
      ["FAILED", "PENDING_PAYMENT"],
      ["FAILED", "CANCELLED"],
      ["PAID", "CONFIRMED"],
      ["PAID", "CANCELLED"],
      ["PAID", "REFUND_PENDING"],
      ["CONFIRMED", "PROCESSING"],
      ["CONFIRMED", "CANCELLED"],
      ["CONFIRMED", "REFUND_PENDING"],
      ["PROCESSING", "PACKED"],
      ["PROCESSING", "CANCELLED"],
      ["PROCESSING", "REFUND_PENDING"],
      ["PACKED", "DISPATCHED"],
      ["PACKED", "REFUND_PENDING"],
      ["DISPATCHED", "OUT_FOR_DELIVERY"],
      ["DISPATCHED", "REFUND_PENDING"],
      ["OUT_FOR_DELIVERY", "DELIVERED"],
      ["OUT_FOR_DELIVERY", "REFUND_PENDING"],
      ["DELIVERED", "REFUND_PENDING"],
      ["REFUND_PENDING", "REFUNDED"],
    ];

    for (const [from, to] of edges) {
      assert.equal(
        canTransition(from, to),
        true,
        `${from} -> ${to} should be legal`,
      );
    }
  });

  it("rejects a representative set of illegal moves", () => {
    const illegal: [OrderStatus, OrderStatus][] = [
      /* Cannot skip stages. */
      ["PENDING_PAYMENT", "CONFIRMED"],
      ["PAID", "PACKED"],
      ["CONFIRMED", "DISPATCHED"],
      /* Cannot go backwards. */
      ["PACKED", "PROCESSING"],
      ["DELIVERED", "OUT_FOR_DELIVERY"],
      ["PAID", "PENDING_PAYMENT"],
      /* Cannot re-request a refund or skip straight to refunded. */
      ["PACKED", "CANCELLED"],
      ["PAID", "REFUNDED"],
      /* Cannot pay twice or fail from a paid state. */
      ["PAID", "PAID"],
      ["PAID", "FAILED"],
    ];

    for (const [from, to] of illegal) {
      assert.equal(
        canTransition(from, to),
        false,
        `${from} -> ${to} should be illegal`,
      );
    }
  });

  it("rejects everything from both terminal states", () => {
    const everyStatus: OrderStatus[] = [
      "PENDING_PAYMENT",
      "PAID",
      "FAILED",
      "CANCELLED",
      "CONFIRMED",
      "PROCESSING",
      "PACKED",
      "DISPATCHED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "REFUND_PENDING",
      "REFUNDED",
    ];

    for (const terminal of ["CANCELLED", "REFUNDED"] as const) {
      for (const to of everyStatus) {
        assert.equal(
          canTransition(terminal, to),
          false,
          `${terminal} is terminal and must reject a move to ${to}`,
        );
      }
    }
  });
});

describe("reservation window: callback vs. online", () => {
  it("holds a callback order's stock longer than an online one's", () => {
    /* The whole point of a separate constant: a callback has no one at a
       payment screen yet, only a promise that a person calls "within the
       hour". A window no longer than the online one would routinely
       expire before the call is even made. */
    assert.ok(CALLBACK_RESERVATION_WINDOW_MS > RESERVATION_WINDOW_MS);
  });

  it("comfortably outlasts the one-hour callback promise made on screen", () => {
    const oneHourMs = 60 * 60 * 1000;
    assert.ok(CALLBACK_RESERVATION_WINDOW_MS > oneHourMs);
  });
});

/* --------------------------------------------------- payment signatures */

describe("Razorpay webhook signatures", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: {} });
  const valid = createHmac("sha256", "webhook_secret_for_unit_tests")
    .update(body)
    .digest("hex");

  it("accepts a delivery signed with the webhook secret", () => {
    assert.equal(verifyWebhookSignature(body, valid), true);
  });

  it("rejects a body that was altered after signing", () => {
    /* The whole point: an attacker who can replay a real signature must
       not be able to change the amount it covers. */
    const tampered = JSON.stringify({ event: "payment.captured", payload: { x: 1 } });
    assert.equal(verifyWebhookSignature(tampered, valid), false);
  });

  it("rejects a missing signature rather than treating it as absent proof", () => {
    assert.equal(verifyWebhookSignature(body, null), false);
    assert.equal(verifyWebhookSignature(body, ""), false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    /* `timingSafeEqual` throws on a length mismatch. An attacker sending
       a two-character signature must get a rejection, not a 500 — and
       certainly not an unhandled crash in the payments path. */
    assert.equal(verifyWebhookSignature(body, "ab"), false);
    assert.equal(verifyWebhookSignature(body, "not-hex-at-all"), false);
  });
});

describe("Razorpay checkout handoff signatures", () => {
  const razorpayOrderId = "order_TESTORDER123";
  const razorpayPaymentId = "pay_TESTPAYMENT123";
  const signature = createHmac("sha256", "rzp_test_secret_for_unit_tests")
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  it("accepts the pair the gateway actually signed", () => {
    assert.equal(
      verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature }),
      true,
    );
  });

  it("rejects a signature lifted from another payment", () => {
    /* Swapping in a different payment id must invalidate it, or one
       genuine payment could be used to confirm any number of orders. */
    assert.equal(
      verifyCheckoutSignature({
        razorpayOrderId,
        razorpayPaymentId: "pay_SOMEONEELSE",
        signature,
      }),
      false,
    );
  });
});

describe("brand wall artwork", () => {
  /* The wall is logos only — a roster line whose file never landed shows
     up as a broken image on the home page rather than as nothing, so the
     roster and `public/brands/` have to agree before a deploy. */
  it("has a file on disk for every brand on the roster", async () => {
    const { access } = await import("node:fs/promises");
    const missing: string[] = [];

    for (const { name, logo } of BRAND_WALL) {
      try {
        await access(new URL(`../public${logo}`, import.meta.url));
      } catch {
        missing.push(`${name} (public${logo})`);
      }
    }

    assert.deepEqual(missing, [], `missing brand artwork:\n  ${missing.join("\n  ")}`);
  });

  it("keys each brand exactly once", () => {
    const slugs = BRAND_WALL.map((b) => b.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });
});

/* ------------------------------------------------------------- inventory */

describe("available quantity", () => {
  it("is on-hand minus reserved", () => {
    assert.equal(availableQty(10, 4), 6);
  });

  it("is zero when everything on hand is reserved", () => {
    assert.equal(availableQty(5, 5), 0);
  });

  it("can go negative — a corrected count catching up with reality", () => {
    /* Not clamped to zero: a negative available count is a real signal
       that a receipt or an adjustment is overdue, and hiding it behind a
       floor of zero would make that invisible to the person who has to
       fix it. */
    assert.equal(availableQty(3, 5), -2);
  });
});

describe("movement arithmetic", () => {
  it("RECEIPT adds to on-hand only", () => {
    assert.deepEqual(movementDelta("RECEIPT", 10), { onHandDelta: 10, reservedDelta: 0 });
  });

  it("RESERVE adds to reserved only", () => {
    assert.deepEqual(movementDelta("RESERVE", 3), { onHandDelta: 0, reservedDelta: 3 });
  });

  it("RELEASE subtracts from reserved only", () => {
    assert.deepEqual(movementDelta("RELEASE", 3), { onHandDelta: 0, reservedDelta: -3 });
  });

  it("COMMIT moves both counters together, by the same amount", () => {
    /* The one property this phase's entire correctness rests on: stock
       that was reserved is now actually gone, not merely unreserved. A
       commit that only touched `reservedQty` would leave `onHandQty`
       overstated forever — the unit that was sold would still read as
       sellable. */
    assert.deepEqual(movementDelta("COMMIT", 4), { onHandDelta: -4, reservedDelta: -4 });
  });

  it("ADJUSTMENT moves on-hand only, and can go either way", () => {
    assert.deepEqual(movementDelta("ADJUSTMENT", 7), { onHandDelta: 7, reservedDelta: 0 });
    assert.deepEqual(movementDelta("ADJUSTMENT", -2), { onHandDelta: -2, reservedDelta: 0 });
  });

  it("RETURN adds to on-hand only", () => {
    assert.deepEqual(movementDelta("RETURN", 1), { onHandDelta: 1, reservedDelta: 0 });
  });
});

describe("which fulfilment types are stock-bearing", () => {
  it("INSTANT and SCHEDULED hold stock", () => {
    assert.equal(isStockBearing("INSTANT"), true);
    assert.equal(isStockBearing("SCHEDULED"), true);
  });

  it("BOOKABLE and MADE_TO_ORDER never hold stock", () => {
    /* BOOKABLE consumes an expert's time slot; MADE_TO_ORDER is cut after
       the order is placed. Checking either against inventory would block
       every made-to-order line at checkout for stock that was never
       meant to exist. */
    assert.equal(isStockBearing("BOOKABLE"), false);
    assert.equal(isStockBearing("MADE_TO_ORDER"), false);
  });
});

describe("untracked-product bypass", () => {
  const line = (over: Partial<{
    variantId: string;
    qty: number;
    fulfilment: Fulfilment;
    stockTracked: boolean;
  }>) => ({
    variantId: "v1",
    qty: 5,
    fulfilment: "INSTANT" as Fulfilment,
    stockTracked: true,
    ...over,
  });

  it("only reserves lines that are both tracked and stock-bearing", () => {
    const lines = [
      line({ variantId: "tracked-instant", stockTracked: true, fulfilment: "INSTANT" }),
      line({ variantId: "untracked-instant", stockTracked: false, fulfilment: "INSTANT" }),
      line({ variantId: "tracked-bookable", stockTracked: true, fulfilment: "BOOKABLE" }),
      line({ variantId: "tracked-made-to-order", stockTracked: true, fulfilment: "MADE_TO_ORDER" }),
      line({ variantId: "tracked-scheduled", stockTracked: true, fulfilment: "SCHEDULED" }),
    ];

    const result = linesRequiringStock(lines);

    assert.deepEqual(
      result.map((l) => l.variantId),
      ["tracked-instant", "tracked-scheduled"],
    );
  });

  it("touches nothing at all when the whole basket is untracked", () => {
    /* This is the ordinary case today — thousands of imported SKUs with
       `stockTracked: false` — and it must cost nothing: no store lookup,
       no reservation, no movement row. */
    const lines = [
      line({ variantId: "a", stockTracked: false, fulfilment: "INSTANT" }),
      line({ variantId: "b", stockTracked: false, fulfilment: "SCHEDULED" }),
    ];

    assert.deepEqual(linesRequiringStock(lines), []);
  });
});

describe("store resolution for a stock-bearing line", () => {
  const servedBy = (storeId: string) => ({ serviceable: true, store: { id: storeId } });
  const unserved = { serviceable: false, store: null };

  it("INSTANT uses the serviceable store when the address is covered", () => {
    assert.equal(
      resolveStoreForStockLine("INSTANT", servedBy("store-near"), "store-default"),
      "store-near",
    );
  });

  it("INSTANT cannot fall back to the default store — there is no 18-minute promise from it", () => {
    assert.equal(resolveStoreForStockLine("INSTANT", unserved, "store-default"), null);
  });

  it("SCHEDULED uses the serviceable store when the address is covered", () => {
    assert.equal(
      resolveStoreForStockLine("SCHEDULED", servedBy("store-near"), "store-default"),
      "store-near",
    );
  });

  it("SCHEDULED falls back to the default store when nothing is in radius", () => {
    assert.equal(
      resolveStoreForStockLine("SCHEDULED", unserved, "store-default"),
      "store-default",
    );
  });

  it("SCHEDULED with no default store configured cannot be reserved either", () => {
    assert.equal(resolveStoreForStockLine("SCHEDULED", unserved, null), null);
  });
});

/*
 * NOT covered here, and not fakeable without a real database:
 *
 * The concurrent-reservation guard — that two callers racing to reserve
 * the last unit of the same (variantId, storeId) cannot both succeed.
 * That property lives entirely in the single conditional `UPDATE` in
 * `reserveVariantStock` (`src/lib/data/inventory.ts`) being evaluated
 * atomically by Postgres; a unit test with a mocked or in-memory store
 * would only prove the mock's own concurrency model, not Postgres's, and
 * would pass even if the real SQL string were subtly wrong. This needs
 * two real concurrent connections against a real `inventory_items` row —
 * the integration harness this repo does not yet have (see
 * docs/production-audit.md, MISSING #7). The same is true of
 * `commitVariantStock`, `releaseVariantStock`, and the order-level claim
 * in `releaseExpiredReservations`.
 */

describe("order history — page bounds (resolveOrderPage)", () => {
  it("defaults to page 1 at the default page size with no skip", () => {
    assert.deepEqual(resolveOrderPage(), {
      page: 1,
      pageSize: DEFAULT_ORDER_PAGE_SIZE,
      skip: 0,
    });
  });

  it("clamps a page below 1 up to 1", () => {
    assert.equal(resolveOrderPage(0).page, 1);
    assert.equal(resolveOrderPage(-5).page, 1);
  });

  it("clamps a pageSize above the cap down to it", () => {
    assert.equal(resolveOrderPage(1, 1000).pageSize, 50);
  });

  it("clamps a pageSize below 1 up to 1", () => {
    assert.equal(resolveOrderPage(1, 0).pageSize, 1);
    assert.equal(resolveOrderPage(1, -3).pageSize, 1);
  });

  it("computes skip from the clamped page and pageSize, not the raw input", () => {
    assert.equal(resolveOrderPage(3, 10).skip, 20);
    /* pageSize is clamped to 50 before skip is derived from it — a caller
       asking for page 2 at an oversized pageSize must not silently skip
       fewer rows than the size it was told back. */
    assert.equal(resolveOrderPage(2, 1000).skip, 50);
  });

  it("a non-integer input falls back to the default rather than producing a fractional skip", () => {
    assert.equal(resolveOrderPage(Number.NaN).page, 1);
    assert.equal(resolveOrderPage(1, Number.NaN).pageSize, DEFAULT_ORDER_PAGE_SIZE);
  });
});

describe("order history — status vocabulary", () => {
  /* Kept in sync with `enum OrderStatus` in prisma/schema.prisma by hand
     here — `Record<OrderStatus, ...>` already makes an omission a type
     error, but this pins the actual set so a schema change that silently
     narrows or renames a status is still caught by a test that does not
     require `tsc` to notice it. */
  const ALL_ORDER_STATUSES = [
    "PENDING_PAYMENT",
    "PAID",
    "FAILED",
    "CANCELLED",
    "CONFIRMED",
    "PROCESSING",
    "PACKED",
    "DISPATCHED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "REFUND_PENDING",
    "REFUNDED",
  ] as const;

  const VALID_TONES = new Set([
    "neutral",
    "accent",
    "success",
    "warning",
    "danger",
    "info",
    "pro",
    "deep",
  ]);

  it("every status has a non-empty, customer-readable label", () => {
    for (const status of ALL_ORDER_STATUSES) {
      const label = ORDER_STATUS_LABEL[status];
      assert.equal(typeof label, "string");
      assert.ok(label.length > 0, `${status} has no label`);
      /* SCREAMING_SNAKE leaking through would read as a bug report, not
         a status, on a customer's own order. */
      assert.ok(!/[A-Z]{2,}/.test(label), `${status}'s label looks unconverted: "${label}"`);
    }
  });

  it("every status maps to one of Badge's own tones", () => {
    for (const status of ALL_ORDER_STATUSES) {
      assert.ok(VALID_TONES.has(ORDER_STATUS_TONE[status]), `${status} has an invalid tone`);
    }
  });

  it("payment still owed reads as something to act on, not as done", () => {
    assert.equal(ORDER_STATUS_TONE.PENDING_PAYMENT, "warning");
  });

  it("a captured payment and a delivered order both read as success", () => {
    assert.equal(ORDER_STATUS_TONE.PAID, "success");
    assert.equal(ORDER_STATUS_TONE.DELIVERED, "success");
  });

  it("money already given back reads as neutral, not as a failure", () => {
    assert.equal(ORDER_STATUS_TONE.REFUNDED, "neutral");
  });

  it("a failed payment is the one status that reads as danger", () => {
    assert.equal(ORDER_STATUS_TONE.FAILED, "danger");
  });
});

describe("order history — payment status vocabulary", () => {
  const ALL_PAYMENT_STATUSES = [
    "CREATED",
    "AUTHORIZED",
    "CAPTURED",
    "FAILED",
    "REFUNDED",
  ] as const;

  it("every payment status has a non-empty label", () => {
    for (const status of ALL_PAYMENT_STATUSES) {
      assert.ok(PAYMENT_STATUS_LABEL[status].length > 0, `${status} has no label`);
    }
  });

  it("a captured payment reads as paid, in the same words as a paid order", () => {
    assert.equal(PAYMENT_STATUS_LABEL.CAPTURED, "Paid");
  });
});

describe("checkout idempotency key basis (basketKey)", () => {
  it("is identical for the same address and lines across two calls", () => {
    const lines = [
      { variantId: "v1", qty: 2 },
      { variantId: "v2", qty: 1 },
    ];
    assert.equal(basketKey("addr-1", lines), basketKey("addr-1", lines));
  });

  it("does not depend on line order — a retry must not look like a new attempt", () => {
    const forward = [
      { variantId: "v1", qty: 2 },
      { variantId: "v2", qty: 1 },
    ];
    const reversed = [
      { variantId: "v2", qty: 1 },
      { variantId: "v1", qty: 2 },
    ];
    assert.equal(basketKey("addr-1", forward), basketKey("addr-1", reversed));
  });

  it("changes when the address changes", () => {
    const lines = [{ variantId: "v1", qty: 2 }];
    assert.notEqual(basketKey("addr-1", lines), basketKey("addr-2", lines));
  });

  it("changes when a quantity changes — a different qty is a different order to place", () => {
    assert.notEqual(
      basketKey("addr-1", [{ variantId: "v1", qty: 2 }]),
      basketKey("addr-1", [{ variantId: "v1", qty: 3 }]),
    );
  });

  it("changes when a line is added or removed", () => {
    const one = [{ variantId: "v1", qty: 2 }];
    const two = [
      { variantId: "v1", qty: 2 },
      { variantId: "v2", qty: 1 },
    ];
    assert.notEqual(basketKey("addr-1", one), basketKey("addr-1", two));
  });
});
