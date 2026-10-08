import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and the modules under test pull it in
   transitively through the Prisma client. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { priceIssues, GST_SLABS, gstRatePct, creatableFulfilment, rupees } =
  await import("@/lib/admin/catalogue-input");

describe("price input", () => {
  it("turns rupees into integer paise", () => {
    assert.equal(rupees.parse(1), 100);
    assert.equal(rupees.parse(249.5), 24_950);
  });

  it("rounds rather than truncating a third decimal", () => {
    /* 0.1 * 100 is 10.000000000000002 in binary floating point. Without
       the round, a price typed as 10.1 would store 1009 paise. */
    assert.equal(rupees.parse(10.1), 1010);
    assert.equal(rupees.parse(0.005), 1);
  });

  it("rejects zero and negative amounts", () => {
    assert.equal(rupees.safeParse(0).success, false);
    assert.equal(rupees.safeParse(-5).success, false);
  });

  it("accepts a sell price at or below the MRP", () => {
    assert.deepEqual(priceIssues({ mrp: 10_000, price: 10_000 }), []);
    assert.deepEqual(priceIssues({ mrp: 10_000, price: 8_000 }), []);
  });

  it("refuses a sell price above the MRP", () => {
    /* `resolveVariantPrice` strikes the MRP through whenever it exceeds
       the amount charged, so this would print an increase as a saving. */
    const issues = priceIssues({ mrp: 10_000, price: 12_000 });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].path, "price");
  });

  it("refuses a Pro rate above the standard price", () => {
    const issues = priceIssues({ mrp: 10_000, price: 9_000, proPrice: 9_500 });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].path, "proPrice");
  });

  it("treats an absent Pro rate as Pro paying the standard price", () => {
    assert.deepEqual(priceIssues({ mrp: 10_000, price: 9_000, proPrice: null }), []);
    assert.deepEqual(priceIssues({ mrp: 10_000, price: 9_000 }), []);
  });
});

describe("catalogue enums", () => {
  it("accepts only the real GST slabs", () => {
    for (const slab of GST_SLABS) assert.equal(gstRatePct.safeParse(slab).success, true);
    assert.equal(gstRatePct.safeParse(1.8).success, false);
    assert.equal(gstRatePct.safeParse(20).success, false);
  });

  it("will not let a hand-added product claim INSTANT fulfilment", () => {
    /* INSTANT is the "18 minutes from a dark store" promise, which is an
       inventory fact. `Product.stockTracked` defaults to off, so a
       product created as INSTANT would make that promise with no stock
       check behind it — the same reason the importers never set it. */
    assert.equal(creatableFulfilment.safeParse("INSTANT").success, false);
    assert.equal(creatableFulfilment.safeParse("SCHEDULED").success, true);
    assert.equal(creatableFulfilment.safeParse("MADE_TO_ORDER").success, true);
  });
});

const { parseCsv } = await import("@/lib/admin/csv");
const { parseProductCsv, toPaise, MAX_IMPORT_ROWS, importTemplateCsv } = await import(
  "@/lib/admin/product-import"
);

const HEADER = "sku,name,brand,category,mrp,price,pro_price,gst_pct,unit,fulfilment,lead_time_days,min_qty,step_qty,description";

describe("csv reading", () => {
  it("keeps commas and doubled quotes inside a quoted field", () => {
    const rows = parseCsv('sku,name\nA1,"Hinge, 110"" wide"');
    assert.equal(rows[0].name, 'Hinge, 110" wide');
  });

  it("strips the BOM Excel writes on every save", () => {
    /* Without this the first header is `﻿sku`, and a perfectly good
       file looks like it has no SKU column at all. */
    const rows = parseCsv('﻿sku,name\nA1,Thing');
    assert.equal(rows[0].sku, "A1");
  });

  it("reads headers case-insensitively and ignores blank lines", () => {
    const rows = parseCsv("SKU,Name\n\nA1,Thing\n\n");
    assert.deepEqual(rows, [{ sku: "A1", name: "Thing" }]);
  });
});

describe("bulk product import", () => {
  it("accepts a minimal row and defaults the sell price to the MRP", () => {
    const out = parseProductCsv("sku,name,mrp\nabc-1,Cement 50kg,363");
    assert.deepEqual(out.problems, []);
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].sku, "ABC-1", "SKUs are upper-cased so case cannot fork a product");
    assert.equal(out.rows[0].mrpPaise, 36_300);
    assert.equal(out.rows[0].pricePaise, 36_300);
  });

  it("reads rupee signs and thousands separators out of a spreadsheet", () => {
    assert.equal(toPaise("₹ 8,039.00"), 803_900);
    assert.equal(toPaise(""), null);
    assert.equal(toPaise("free"), null);
    assert.equal(toPaise("0"), null);
  });

  it("refuses the file outright when a required column is missing", () => {
    /* Reporting this per row would print the same complaint 400 times. */
    const out = parseProductCsv("sku,name\nA1,Thing");
    assert.deepEqual(out.missingColumns, ["mrp"]);
    assert.equal(out.rows.length, 0);
  });

  it("names the columns it does not understand", () => {
    const out = parseProductCsv("sku,name,mrp,colour\nA1,Thing,10,red");
    assert.deepEqual(out.unknownColumns, ["colour"]);
    assert.equal(out.rows.length, 1, "an unknown column is ignored, not fatal");
  });

  it("rejects a sell price above the MRP and a Pro rate above the sell price", () => {
    const out = parseProductCsv(
      `${HEADER}\nA1,Thing,,,100,120,,,,,,,,\nA2,Thing,,,100,90,95,,,,,,,`,
    );
    assert.equal(out.rows.length, 0);
    assert.equal(out.problems.length, 2);
    assert.match(out.problems[0].message, /above the MRP/);
    assert.match(out.problems[1].message, /above the sell price/);
  });

  it("will not let a bulk upload claim INSTANT fulfilment", () => {
    const out = parseProductCsv(`${HEADER}\nA1,Thing,,,100,,,,,instant,,,,`);
    assert.equal(out.rows.length, 0);
    assert.match(out.problems[0].message, /dark store/);
  });

  it("accepts a fulfilment and unit however they are spelled", () => {
    const out = parseProductCsv(`${HEADER}\nA1,Thing,,,100,,,,per piece,Made-To-Order,,,,`);
    assert.deepEqual(out.problems, []);
    assert.equal(out.rows[0].unit, "PER_PIECE");
    assert.equal(out.rows[0].fulfilment, "MADE_TO_ORDER");
  });

  it("rejects a GST rate that is not a real slab", () => {
    const out = parseProductCsv(`${HEADER}\nA1,Thing,,,100,,,7,,,,,,`);
    assert.equal(out.rows.length, 0);
    assert.match(out.problems[0].message, /GST must be one of/);
  });

  it("catches a SKU repeated inside one file", () => {
    /* Applied in order, the second write would silently win over the
       first and nobody would know which price landed. */
    const out = parseProductCsv("sku,name,mrp\nA1,Thing,100\nA1,Thing again,200");
    assert.equal(out.rows.length, 1);
    assert.match(out.problems[0].message, /already on line 2/);
  });

  it("reports the spreadsheet's own line numbers", () => {
    /* Line 1 is the header, so the first data row is line 2 — which is
       what the person looking at the file in Excel sees. */
    const out = parseProductCsv("sku,name,mrp\nA1,Thing,100\n,Nameless,100");
    assert.equal(out.rows[0].line, 2);
    assert.equal(out.problems[0].line, 3);
  });

  it("distinguishes a blank optional cell from a zero", () => {
    /* A blank means "leave this alone" on an existing product; the route
       relies on null rather than a falsy number to tell them apart. */
    const out = parseProductCsv(`${HEADER}\nA1,Thing,,,100,,,,,,0,,,`);
    assert.equal(out.rows[0].leadTimeDays, 0);
    assert.equal(out.rows[0].minQty, null);
    assert.equal(out.rows[0].description, null);
  });

  it("ships a template that its own parser accepts", () => {
    const out = parseProductCsv(importTemplateCsv());
    assert.deepEqual(out.problems, []);
    assert.deepEqual(out.missingColumns, []);
    assert.deepEqual(out.unknownColumns, []);
    assert.equal(out.rows.length, 1);
  });

  it("caps a web upload well below a request timeout", () => {
    assert.ok(MAX_IMPORT_ROWS <= 1000);
  });
});
