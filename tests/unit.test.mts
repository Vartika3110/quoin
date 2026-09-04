import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and otp.ts pulls AUTH_SECRET from it. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

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
type CatalogProduct = import("@/lib/types/catalog").Product;

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
