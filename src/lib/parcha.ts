/**
 * Reading a materials list.
 *
 * A parcha is a handwritten list a site engineer or contractor hands over
 * the counter: a quantity, a unit and a name per line, in no fixed order
 * and with no fixed punctuation. These are all the same line —
 *
 *     Cement 40 bags
 *     40 bags cement
 *     cement - 40 bag
 *     40 x Cement
 *     Cement    40
 *
 * — and a parser that only handles the first is a parser that fails on
 * most real lists.
 *
 * Deliberately pure and dependency-free: it runs in the browser as the
 * customer types and on the server when the same text arrives through the
 * API, and the two must agree about what a line means. It is also the
 * reason this is testable at all — see `tests/unit.test.mts`.
 *
 * What it does **not** do is guess a product. Matching a term to a
 * catalogue row is a database question, answered in `matchParchaLines`.
 */

/** The units a materials list is actually written in. */
const UNITS: Record<string, string> = {
  bag: "bags",
  bags: "bags",
  bori: "bags",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  ton: "tonnes",
  tons: "tonnes",
  tonne: "tonnes",
  tonnes: "tonnes",
  l: "litres",
  ltr: "litres",
  ltrs: "litres",
  litre: "litres",
  litres: "litres",
  liter: "litres",
  liters: "litres",
  sqft: "sq.ft.",
  sft: "sq.ft.",
  "sq.ft": "sq.ft.",
  "sq.ft.": "sq.ft.",
  sqm: "sq.m.",
  rft: "running ft.",
  "r.ft": "running ft.",
  ft: "ft",
  feet: "ft",
  m: "m",
  mtr: "m",
  metre: "m",
  metres: "m",
  no: "pieces",
  nos: "pieces",
  pc: "pieces",
  pcs: "pieces",
  piece: "pieces",
  pieces: "pieces",
  box: "boxes",
  boxes: "boxes",
  set: "sets",
  sets: "sets",
  roll: "rolls",
  rolls: "rolls",
  sheet: "sheets",
  sheets: "sheets",
  bundle: "bundles",
  bundles: "bundles",
};

export interface ParchaLine {
  /** Stable within one parse, so React keys and edits survive a re-render. */
  id: string;
  /** The line exactly as it was written. Kept so nothing is lost. */
  raw: string;
  /** What to search the catalogue for. */
  term: string;
  /** Quantity, or 1 when the line did not carry one. */
  qty: number;
  /** Normalised unit, or null when none was written. */
  unit: string | null;
}

/**
 * Splits a pasted list into lines and reads each one.
 *
 * Commas separate items as often as newlines do — "cement 40 bags, 20mm
 * pipe 30" is one line of text and two items — so both are separators.
 * Bullets, dashes and serial numbers at the start of a line are stripped:
 * a list written "1. Cement 40 bags" must not search for "1. Cement".
 */
export function parseParcha(text: string): ParchaLine[] {
  return text
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((raw, index) => ({ ...readLine(raw), id: `l${index}`, raw }))
    .filter((line) => line.term.length >= 2);
}

function readLine(raw: string): Omit<ParchaLine, "id" | "raw"> {
  /* Leading bullet, dash or "3)" / "3." serial number. */
  let text = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();

  let qty: number | null = null;
  let unit: string | null = null;

  /* Trailing quantity: "Cement 40 bags", "Cement - 40", "Cement 40bags". */
  const trailing = text.match(
    /[\s\-–:]+(\d+(?:\.\d+)?)\s*([A-Za-z.]+)?\s*$/,
  );
  if (trailing) {
    const trailingUnit = normalizeUnit(trailing[2]);
    /* Only read it as a quantity when the trailing word really was a unit,
       or when there was no trailing word at all. "Pipe 20 mm" ends in a
       number and a word, and neither is a quantity — taking them would
       both lose the "mm" that identifies the pipe and order twenty of it. */
    if (!trailing[2] || trailingUnit) {
      qty = Number(trailing[1]);
      unit = trailingUnit;
      text = text.slice(0, trailing.index).trim();
    }
  }

  /* Leading quantity: "40 bags cement", "40 x cement", "40kg steel". */
  if (qty == null) {
    const leading = text.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z.]+)?\s*(?:x\s*)?/i);
    if (leading) {
      const maybeUnit = normalizeUnit(leading[2]);
      /* A leading number is only a quantity when a unit or an "x" follows
         it. "8 inch pipe" and "40mm bend" are names, not quantities, and
         stripping the number destroys the search term. */
      const hasX = /^\d+(?:\.\d+)?\s*x\s/i.test(text);
      if (maybeUnit || hasX) {
        qty = Number(leading[1]);
        unit = maybeUnit;
        text = text.slice(leading[0].length).trim();
      }
    }
  }

  return {
    /* Punctuation left over from the split — a trailing dash, a colon. */
    term: text.replace(/[\s\-–:]+$/, "").trim(),
    qty: qty && qty > 0 ? qty : 1,
    unit,
  };
}

function normalizeUnit(word: string | undefined): string | null {
  if (!word) return null;
  return UNITS[word.toLowerCase().replace(/\.$/, "")] ?? null;
}

/* ---- Pricing a line against a product it may not be measured like ------- */

/**
 * Units a customer writes when they are measuring *material*, by weight
 * or by volume, rather than counting packages.
 */
const BULK_UNITS = new Set(["kg", "tonnes", "litres", "sq.ft.", "sq.m.", "running ft.", "ft", "m"]);

/**
 * Units a catalogue row uses when it is priced by the *package* — one
 * piece, one bag, one bundle, one visit.
 *
 * The value is how to say it in a sentence, so the set that decides the
 * guard and the words that explain it to the customer cannot drift
 * apart: adding a packaged unit here is what makes it both guarded and
 * sayable.
 */
const PACKAGED_PRICING: Record<string, string> = {
  PER_PIECE: "by the piece",
  PER_VISIT: "by the visit",
  PER_BAG: "by the bag",
};

/**
 * "by the piece", for a sentence explaining why a line was not
 * multiplied out. Null for a row priced by weight, area or volume —
 * which is a row the guard never fires on.
 */
export function pricedByPhrase(pricingUnit: string | null): string | null {
  return pricingUnit ? (PACKAGED_PRICING[pricingUnit] ?? null) : null;
}

/**
 * Whether multiplying a line's quantity by a product's price would be
 * arithmetic on two different things.
 *
 * The case this exists for, found on a real list: *"saria 500 kg"*
 * matches "TMT bars (1 bundle)", which is priced per bundle, and
 * 500 × the bundle price put **₹26,39,500** on screen next to a line the
 * customer wrote asking for half a tonne of rebar. A number that wrong,
 * shown with confidence, is worse than no number — it is the kind of
 * thing somebody forwards to a client.
 *
 * Deliberately narrow, and only in one direction: the customer measured
 * in weight, volume or area, and the row is sold by the package. That
 * catches the disaster without touching the cases that work.
 *
 * It specifically does **not** fire on "cement 20 bags" against a row
 * marked `PER_KG`. That row is mis-united — a 50kg bag priced per kg is
 * one of the 78 findings `scripts/audit-catalogue.ts` reports — but the
 * price on it really is the price of a bag, so multiplying is right and
 * hedging would replace a correct total with a warning on hundreds of
 * lines. Fixing the data is what fixes those; this guards the ones no
 * amount of correct data would make safe.
 */
export function quantityIsComparable(
  lineUnit: string | null,
  pricingUnit: string | null,
): boolean {
  if (!lineUnit || !pricingUnit) return true;
  return !(BULK_UNITS.has(lineUnit) && pricingUnit in PACKAGED_PRICING);
}
