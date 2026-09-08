import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — see tests/unit.test.mts for why these
   two are required even though nothing here touches auth or payments. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { extractCsvLines, parseCsvRows, classifyFile, decideExtractionAction, decodeCsvBuffer } =
  await import("@/lib/parcha-extract");

const { matchConfidence, statusAfterItemDecisions, hashIp, callerIp } = await import(
  "@/lib/data/parcha-submissions"
);

/** ---- CSV row extraction --------------------------------------------- */

describe("parseCsvRows", () => {
  it("splits plain rows on commas and newlines", () => {
    assert.deepEqual(parseCsvRows("Cement,40,bags\nSteel,2,ton"), [
      ["Cement", "40", "bags"],
      ["Steel", "2", "ton"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    assert.deepEqual(parseCsvRows('"Cement, OPC 53 grade",40,bags'), [
      ["Cement, OPC 53 grade", "40", "bags"],
    ]);
  });

  it("reads a doubled quote as one literal quote", () => {
    assert.deepEqual(parseCsvRows('"6"" pipe",10,pieces'), [["6\" pipe", "10", "pieces"]]);
  });

  it("handles CRLF line endings", () => {
    assert.deepEqual(parseCsvRows("Cement,40\r\nSteel,2"), [
      ["Cement", "40"],
      ["Steel", "2"],
    ]);
  });

  it("keeps a final row with no trailing newline", () => {
    assert.deepEqual(parseCsvRows("Cement,40,bags"), [["Cement", "40", "bags"]]);
  });
});

describe("extractCsvLines", () => {
  it("joins a row's cells into one parseParcha-shaped line", () => {
    assert.deepEqual(extractCsvLines("Cement,40,bags\nTMT Steel,2,ton"), [
      "Cement 40 bags",
      "TMT Steel 2 ton",
    ]);
  });

  it("drops a header row", () => {
    assert.deepEqual(extractCsvLines("Item,Quantity,Unit\nCement,40,bags"), ["Cement 40 bags"]);
  });

  it("drops a header row even after leading blank lines", () => {
    assert.deepEqual(extractCsvLines("\n\nItem,Qty,Unit\nCement,40,bags"), ["Cement 40 bags"]);
  });

  it("drops blank lines anywhere in the file", () => {
    assert.deepEqual(extractCsvLines("Cement,40,bags\n\n\nSteel,2,ton\n"), [
      "Cement 40 bags",
      "Steel 2 ton",
    ]);
  });

  it("keeps quoted fields containing commas intact as one cell", () => {
    assert.deepEqual(extractCsvLines('"Cement, OPC 53 grade",40,bags'), [
      "Cement, OPC 53 grade 40 bags",
    ]);
  });

  it("passes a prose row through rather than silently dropping it", () => {
    /* Nothing about "please deliver before 6pm" is a header (no header
       word matches) and it is not blank, so it becomes a line — matching
       against the catalogue, not extraction, is what makes it read as a
       poor result. */
    assert.deepEqual(extractCsvLines("Item,Qty\nplease deliver before 6pm"), [
      "please deliver before 6pm",
    ]);
  });

  it("does not treat a real material row as a header", () => {
    /* "Cement" and "bags" are not header words, so a single-row file with
       no header present is read as one line, not silently skipped. */
    assert.deepEqual(extractCsvLines("Cement,40,bags"), ["Cement 40 bags"]);
  });

  it("strips a UTF-8 BOM before parsing", () => {
    const withBom = "﻿Item,Qty\nCement,40,bags";
    assert.deepEqual(extractCsvLines(withBom), ["Cement 40 bags"]);
  });
});

describe("decodeCsvBuffer", () => {
  it("strips a leading BOM from the decoded text", () => {
    const buffer = Buffer.from("﻿Cement,40,bags", "utf8");
    assert.equal(decodeCsvBuffer(buffer), "Cement,40,bags");
  });

  it("leaves ordinary UTF-8 text untouched", () => {
    const buffer = Buffer.from("Cement,40,bags", "utf8");
    assert.equal(decodeCsvBuffer(buffer), "Cement,40,bags");
  });
});

/** ---- File-type routing ------------------------------------------------ */

describe("classifyFile", () => {
  it("classifies by extension first", () => {
    assert.equal(classifyFile("application/octet-stream", "list.csv"), "csv");
    assert.equal(classifyFile("application/octet-stream", "list.xlsx"), "xlsx");
    assert.equal(classifyFile("application/octet-stream", "list.pdf"), "pdf");
    assert.equal(classifyFile("application/octet-stream", "photo.heic"), "image");
  });

  it("falls back to content type when the extension is unhelpful", () => {
    assert.equal(classifyFile("text/csv", "upload"), "csv");
    assert.equal(classifyFile("image/jpeg", "upload"), "image");
    assert.equal(classifyFile("application/pdf", "upload"), "pdf");
  });

  it("is unknown for something that is neither", () => {
    assert.equal(classifyFile("application/zip", "archive.zip"), "unknown");
  });
});

describe("decideExtractionAction — never claims to have read what it has not", () => {
  it("routes a CSV to real parsing", () => {
    assert.deepEqual(decideExtractionAction("csv", false), { action: "parse_csv" });
    assert.deepEqual(decideExtractionAction("csv", true), { action: "parse_csv" });
  });

  it("routes XLSX to manual review regardless of OCR configuration", () => {
    for (const ocrConfigured of [false, true]) {
      const decision = decideExtractionAction("xlsx", ocrConfigured);
      assert.equal(decision.action, "manual_review");
      assert.ok(decision.note && decision.note.length > 0);
    }
  });

  it("routes PDF and image to manual review when no OCR provider is configured", () => {
    for (const kind of ["pdf", "image"] as const) {
      const decision = decideExtractionAction(kind, false);
      assert.equal(decision.action, "manual_review");
      assert.match(decision.note ?? "", /no OCR provider/i);
    }
  });

  it("routes PDF and image to OCR once a provider is configured", () => {
    for (const kind of ["pdf", "image"] as const) {
      assert.deepEqual(decideExtractionAction(kind, true), { action: "run_ocr" });
    }
  });

  it("routes an unrecognised file to manual review", () => {
    const decision = decideExtractionAction("unknown", true);
    assert.equal(decision.action, "manual_review");
  });

  it("never returns an action implying a photograph or PDF was read, unconfigured", () => {
    for (const kind of ["pdf", "image", "xlsx", "unknown"] as const) {
      const decision = decideExtractionAction(kind, false);
      assert.notEqual(decision.action, "parse_csv");
      assert.notEqual(decision.action, "run_ocr");
    }
  });
});

/** ---- Confidence --------------------------------------------------------- */

describe("matchConfidence", () => {
  it("is 100 when every word of the term appears in the matched title", () => {
    assert.equal(matchConfidence("Cement OPC 53", "UltraTech Cement OPC 53 Grade 50kg Bag"), 100);
  });

  it("is a fraction when only some words are covered", () => {
    assert.equal(matchConfidence("blue tile", "Kajaria Ceramic Floor Tile 2x2"), 50);
  });

  it("is 0 when no word of the term appears in the title at all", () => {
    assert.equal(matchConfidence("xyz widget", "UltraTech Cement OPC 53"), 0);
  });

  it("is case-insensitive", () => {
    assert.equal(matchConfidence("CEMENT", "cement opc 53"), 100);
  });

  it("is 0, not NaN, for an empty term", () => {
    assert.equal(matchConfidence("", "Anything"), 0);
  });
});

/** ---- Status transitions ------------------------------------------------- */

describe("statusAfterItemDecisions", () => {
  it("stays NEEDS_REVIEW while any item is undecided", () => {
    assert.equal(
      statusAfterItemDecisions([{ accepted: true }, { accepted: null }]),
      "NEEDS_REVIEW",
    );
  });

  it("is COMPLETED once every item has accepted or rejected", () => {
    assert.equal(
      statusAfterItemDecisions([{ accepted: true }, { accepted: false }]),
      "COMPLETED",
    );
  });

  it("a submission with zero items is never COMPLETED", () => {
    assert.equal(statusAfterItemDecisions([]), "NEEDS_REVIEW");
  });

  it("false counts as decided, not as still-pending", () => {
    assert.equal(statusAfterItemDecisions([{ accepted: false }]), "COMPLETED");
  });
});

/** ---- Rate limiting ------------------------------------------------------ */

describe("hashIp", () => {
  /* The limiter itself is now a `count` against `parcha_submissions.ipHash`
     over a time window — it moved out of process memory because a counter
     held in one serverless instance is a limit the next request skips. That
     query needs a database and so is not unit-tested here; what is testable
     is the key it counts on. */

  it("is stable for the same address", () => {
    assert.equal(hashIp("203.0.113.10"), hashIp("203.0.113.10"));
  });

  it("separates different addresses", () => {
    assert.notEqual(hashIp("203.0.113.10"), hashIp("203.0.113.11"));
  });

  it("does not retain the address it was given", () => {
    const ip = "203.0.113.10";
    const hashed = hashIp(ip);
    assert.ok(!hashed.includes(ip));
    /* A hex SHA-256 digest, so the column can never be read back as a
       browsing log even by someone holding the table. */
    assert.match(hashed, /^[0-9a-f]{64}$/);
  });
});

describe("callerIp", () => {
  it("reads the first hop of X-Forwarded-For", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" });
    assert.equal(callerIp(headers), "198.51.100.4");
  });

  it("falls back to X-Real-Ip", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.9" });
    assert.equal(callerIp(headers), "198.51.100.9");
  });

  it("falls back to 'unknown' with neither header", () => {
    assert.equal(callerIp(new Headers()), "unknown");
  });
});

/** ---- Reading a parcha with a model ------------------------------------
 *
 * The network call itself is not tested here — there is no fixture for
 * "what a model returns" that would not just be this codebase asserting
 * its own guess. What *is* tested is everything on either side of it: the
 * validation that decides whether an answer is usable at all, and the
 * rendering that has to survive `parseParcha` reading it back, because
 * that round trip is what the whole pricing flow depends on.
 */

const { parseItems, formatItemLine, unitToken, ParchaReadError } = await import(
  "@/lib/parcha-openai"
);
const { renameToJpeg } = await import("@/lib/parcha-image");
const { parseParcha } = await import("@/lib/parcha");

describe("parseItems", () => {
  it("reads the agreed shape", () => {
    const items = parseItems(
      '{"items":[{"name":"Cement","quantity":40,"unit":"bags","brand":null}]}',
    );
    assert.deepEqual(items, [
      { name: "Cement", quantity: 40, unit: "bags", brand: null },
    ]);
  });

  it("refuses anything that is not JSON", () => {
    assert.throws(() => parseItems("Sorry, I could not read that."), ParchaReadError);
  });

  it("refuses JSON without an items array", () => {
    assert.throws(() => parseItems('{"materials":[]}'), ParchaReadError);
    assert.throws(() => parseItems('{"items":"cement"}'), ParchaReadError);
  });

  it("returns empty rather than throwing when the model found nothing", () => {
    assert.deepEqual(parseItems('{"items":[]}'), []);
  });

  it("drops an entry with no name but keeps the rest", () => {
    const items = parseItems(
      '{"items":[{"name":"","quantity":5,"unit":"nos","brand":null},{"name":"Steel","quantity":250,"unit":"kg","brand":null}]}',
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "Steel");
  });

  it("keeps an item whose quantity is missing rather than inventing one", () => {
    const items = parseItems(
      '{"items":[{"name":"Jaquar shower head","quantity":null,"unit":null,"brand":"Jaquar"}]}',
    );
    assert.equal(items[0].quantity, null);
    assert.equal(items[0].unit, null);
  });

  it("treats a nonsense quantity as missing", () => {
    const items = parseItems(
      '{"items":[{"name":"Cement","quantity":-4,"unit":"bags","brand":null},{"name":"Sand","quantity":"lots","unit":null,"brand":null}]}',
    );
    assert.equal(items[0].quantity, null);
    assert.equal(items[1].quantity, null);
  });

  it("strips separators out of a name so one item cannot become two", () => {
    /* `parseParcha` splits on newlines, commas and semicolons. A product
       name carrying one would otherwise be priced as two lines. */
    const items = parseItems(
      '{"items":[{"name":"Cement, OPC 53\\ngrade","quantity":40,"unit":"bags","brand":null}]}',
    );
    assert.equal(items[0].name, "Cement OPC 53 grade");
  });
});

describe("unitToken", () => {
  it("normalises a spaced unit to one parseParcha can read", () => {
    assert.equal(unitToken("sq ft"), "sqft");
    assert.equal(unitToken("Square Feet"), "sqft");
  });

  it("normalises the ways a materials list writes a count", () => {
    assert.equal(unitToken("Nos."), "nos");
    assert.equal(unitToken("pcs"), "nos");
    assert.equal(unitToken("pieces"), "nos");
  });

  it("leaves a unit it does not know alone", () => {
    assert.equal(unitToken("gunny"), "gunny");
  });
});

describe("formatItemLine", () => {
  it("writes the line the way a parcha is written", () => {
    assert.equal(
      formatItemLine({ name: "Cement", quantity: 40, unit: "bags", brand: null }),
      "Cement 40 bags",
    );
  });

  it("puts the brand in front of the name", () => {
    assert.equal(
      formatItemLine({
        name: "White Emulsion",
        quantity: 18,
        unit: "ltr",
        brand: "Asian Paints",
      }),
      "Asian Paints White Emulsion 18 ltr",
    );
  });

  it("does not repeat a brand the name already carries", () => {
    assert.equal(
      formatItemLine({
        name: "Jaquar Shower Head",
        quantity: 2,
        unit: "pcs",
        brand: "Jaquar",
      }),
      "Jaquar Shower Head 2 nos",
    );
  });

  it("leaves a missing quantity missing", () => {
    assert.equal(
      formatItemLine({ name: "Jaquar shower head", quantity: null, unit: null, brand: null }),
      "Jaquar shower head",
    );
  });

  it("omits a unit it has no quantity for", () => {
    assert.equal(
      formatItemLine({ name: "Sand", quantity: null, unit: "cft", brand: null }),
      "Sand",
    );
  });
});

describe("an extracted list read back by parseParcha", () => {
  /* The test case the feature was specified against. Every one of these
     has to survive being rendered to text and parsed back, because the
     textarea — not the model's JSON — is what gets priced. */
  const extracted = [
    { name: "Cement", quantity: 40, unit: "bags", brand: null },
    { name: "TMT Steel", quantity: 250, unit: "kg", brand: null },
    { name: "White Emulsion", quantity: 18, unit: "ltr", brand: "Asian Paints" },
    { name: "Shower Head", quantity: 2, unit: "pcs", brand: "Jaquar" },
    { name: "CPVC Pipe 1 inch", quantity: 20, unit: "nos", brand: null },
    { name: "Floor Tiles", quantity: 620, unit: "sq ft", brand: null },
  ];

  const text = extracted.map(formatItemLine).join("\n");
  const lines = parseParcha(text);

  it("keeps every item", () => {
    assert.equal(lines.length, 6);
  });

  it("keeps every quantity", () => {
    assert.deepEqual(
      lines.map((l) => l.qty),
      [40, 250, 18, 2, 20, 620],
    );
  });

  it("keeps every unit, normalised", () => {
    assert.deepEqual(
      lines.map((l) => l.unit),
      ["bags", "kg", "litres", "pieces", "pieces", "sq.ft."],
    );
  });

  it("leaves a searchable term, with the brand and the size intact", () => {
    assert.deepEqual(
      lines.map((l) => l.term),
      [
        "Cement",
        "TMT Steel",
        "Asian Paints White Emulsion",
        "Jaquar Shower Head",
        "CPVC Pipe 1 inch",
        "Floor Tiles",
      ],
    );
  });

  it("reads an item with no quantity as one of it", () => {
    const [line] = parseParcha(
      formatItemLine({ name: "Jaquar shower head", quantity: null, unit: null, brand: null }),
    );
    assert.equal(line.qty, 1);
    assert.equal(line.term, "Jaquar shower head");
  });
});

describe("renameToJpeg", () => {
  it("renames a converted photo so the extension matches the bytes", () => {
    assert.equal(renameToJpeg("IMG_4021.HEIC"), "IMG_4021.jpg");
    assert.equal(renameToJpeg("parcha"), "parcha.jpg");
  });
});
