import { GST_SLABS } from "@/lib/admin/catalogue-input";
import { parseCsv } from "@/lib/admin/csv";

/**
 * A bulk upload, before it touches a database.
 *
 * Everything in this file is pure: text in, a validated plan or a list of
 * complaints out. That is what makes the dry run trustworthy — the
 * preview a merchandiser confirms is produced by exactly this code, so it
 * cannot describe one thing and apply another.
 *
 * The header is Quoin's own, not the scrape format in
 * `research/data/all-products.csv`. That file carries `source`, `url` and
 * `image`, which belong in the quarantined `source*` columns and describe
 * what a *competitor* listed. A sheet of our own products has no business
 * carrying them, and accepting them here would be the one place those
 * columns could be filled in by hand.
 */

export const IMPORT_COLUMNS = [
  "sku",
  "name",
  "brand",
  "category",
  "mrp",
  "price",
  "pro_price",
  "gst_pct",
  "unit",
  "fulfilment",
  "lead_time_days",
  "min_qty",
  "step_qty",
  "description",
] as const;

export const REQUIRED_COLUMNS = ["sku", "name", "mrp"] as const;

/**
 * Deliberately low for a web upload.
 *
 * A browser request has a timeout a 3,000-row file will not survive, and
 * a half-applied import nobody can see the end of is worse than a refused
 * one. `npm run db:import` exists for a whole supplier catalogue; this is
 * for the sheet a merchandiser was emailed this morning.
 */
export const MAX_IMPORT_ROWS = 500;

/* The two enums an uploaded row may carry, as literal unions rather than
   `string`. The route writes these straight into Prisma, and a widened
   `string` there would need a cast — which is exactly the cast that stops
   the compiler noticing when the schema's enum changes. */
export type ImportUnit =
  | "PER_PIECE"
  | "PER_SQFT"
  | "PER_RUNNING_FT"
  | "PER_VISIT"
  | "PER_BAG"
  | "PER_LITRE"
  | "PER_KG";

/** `INSTANT` is absent for the reason it is absent from the add form. */
export type ImportFulfilment = "SCHEDULED" | "BOOKABLE" | "MADE_TO_ORDER";

export interface ParsedRow {
  /** 1-based line in the file as opened in a spreadsheet, header included. */
  line: number;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  mrpPaise: number;
  pricePaise: number;
  proPricePaise: number | null;
  gstRatePct: number | null;
  unit: ImportUnit | null;
  fulfilment: ImportFulfilment | null;
  leadTimeDays: number | null;
  minQty: number | null;
  stepQty: number | null;
  description: string | null;
}

export interface RowProblem {
  line: number;
  sku: string;
  message: string;
}

const UNITS: readonly ImportUnit[] = [
  "PER_PIECE",
  "PER_SQFT",
  "PER_RUNNING_FT",
  "PER_VISIT",
  "PER_BAG",
  "PER_LITRE",
  "PER_KG",
];

const FULFILMENTS: readonly ImportFulfilment[] = ["SCHEDULED", "BOOKABLE", "MADE_TO_ORDER"];

function isUnit(value: string): value is ImportUnit {
  return (UNITS as readonly string[]).includes(value);
}

function isFulfilment(value: string): value is ImportFulfilment {
  return (FULFILMENTS as readonly string[]).includes(value);
}

/** "per piece", "Per-Piece" and "PER_PIECE" are the same answer. */
function normaliseEnum(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

/**
 * '8,039.0' and '₹ 8039' both mean 803900 paise.
 *
 * Integer paise, never float rupees — the one rule the whole catalogue is
 * built on. A sheet that has been through Excel routinely carries the
 * rupee sign and thousands separators, and refusing those would make the
 * importer useless on the files it actually receives.
 */
export function toPaise(raw: string): number | null {
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const value = Number.parseFloat(digits);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function toInt(raw: string): number | null {
  const digits = raw.replace(/[^\d-]/g, "");
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

export interface ParseResult {
  rows: ParsedRow[];
  problems: RowProblem[];
  /** Required columns the header is missing. Nothing is read without them. */
  missingColumns: string[];
  /** Columns present that this importer does not understand. */
  unknownColumns: string[];
  totalRows: number;
}

export function parseProductCsv(text: string): ParseResult {
  const raw = parseCsv(text);
  const header = raw.length > 0 ? Object.keys(raw[0]) : [];

  const known = new Set<string>(IMPORT_COLUMNS);
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  const unknownColumns = header.filter((h) => h !== "" && !known.has(h));

  if (missingColumns.length > 0) {
    return { rows: [], problems: [], missingColumns, unknownColumns, totalRows: raw.length };
  }

  const rows: ParsedRow[] = [];
  const problems: RowProblem[] = [];
  /* A SKU repeated inside one file would be applied twice, and the second
     write would silently win over the first. Caught here rather than
     letting the database decide which one survives. */
  const seen = new Map<string, number>();

  raw.forEach((cells, index) => {
    const line = index + 2;
    const sku = (cells.sku ?? "").toUpperCase();
    const fail = (message: string) => problems.push({ line, sku, message });

    if (!sku) return fail("No product code");
    if (seen.has(sku)) return fail(`Repeats ${sku}, already on line ${seen.get(sku)}`);

    const name = cells.name ?? "";
    if (name.length < 2) return fail("No product name");

    const mrpPaise = toPaise(cells.mrp ?? "");
    if (mrpPaise == null) return fail("No readable MRP");

    /* A blank sell price means "sell at MRP", as it does everywhere else
       a price is entered in these tools. */
    const pricePaise = (cells.price ?? "").trim() === "" ? mrpPaise : toPaise(cells.price ?? "");
    if (pricePaise == null) return fail("Sell price is not a number");
    if (pricePaise > mrpPaise) return fail("Sell price is above the MRP");

    const proRaw = (cells.pro_price ?? "").trim();
    const proPricePaise = proRaw === "" ? null : toPaise(proRaw);
    if (proRaw !== "" && proPricePaise == null) return fail("Pro price is not a number");
    if (proPricePaise != null && proPricePaise > pricePaise) {
      return fail("Pro price is above the sell price");
    }

    const gstRaw = (cells.gst_pct ?? "").trim();
    let gstRatePct: number | null = null;
    if (gstRaw !== "") {
      const parsed = toInt(gstRaw);
      if (parsed == null || !(GST_SLABS as readonly number[]).includes(parsed)) {
        return fail(`GST must be one of ${GST_SLABS.join(", ")}`);
      }
      gstRatePct = parsed;
    }

    const unitRaw = (cells.unit ?? "").trim();
    let unit: ImportUnit | null = null;
    if (unitRaw !== "") {
      const normalised = normaliseEnum(unitRaw);
      if (!isUnit(normalised)) return fail(`“${unitRaw}” is not a pricing unit`);
      unit = normalised;
    }

    const fulfilmentRaw = (cells.fulfilment ?? "").trim();
    let fulfilment: ImportFulfilment | null = null;
    if (fulfilmentRaw !== "") {
      const normalised = normaliseEnum(fulfilmentRaw);
      if (normalised === "INSTANT") {
        return fail(
          "Instant cannot be set by import — it promises a dark store holds the item. Count stock in first.",
        );
      }
      if (!isFulfilment(normalised)) return fail(`“${fulfilmentRaw}” is not a fulfilment type`);
      fulfilment = normalised;
    }

    const minQty = (cells.min_qty ?? "").trim() === "" ? null : toInt(cells.min_qty ?? "");
    const stepQty = (cells.step_qty ?? "").trim() === "" ? null : toInt(cells.step_qty ?? "");
    if ((minQty != null && minQty < 1) || (stepQty != null && stepQty < 1)) {
      return fail("Minimum and step quantities must be at least 1");
    }

    const leadRaw = (cells.lead_time_days ?? "").trim();
    const leadTimeDays = leadRaw === "" ? null : toInt(leadRaw);
    if (leadRaw !== "" && (leadTimeDays == null || leadTimeDays < 0 || leadTimeDays > 365)) {
      return fail("Lead time must be a whole number of days, 0 to 365");
    }

    seen.set(sku, line);
    rows.push({
      line,
      sku,
      name,
      brand: (cells.brand ?? "").trim() || null,
      category: (cells.category ?? "").trim() || null,
      mrpPaise,
      pricePaise,
      proPricePaise,
      gstRatePct,
      unit,
      fulfilment,
      leadTimeDays,
      minQty,
      stepQty,
      description: (cells.description ?? "").trim() || null,
    });
  });

  return { rows, problems, missingColumns, unknownColumns, totalRows: raw.length };
}

/** A blank sheet with the header, for someone starting from nothing. */
export function importTemplateCsv(): string {
  return [
    IMPORT_COLUMNS.join(","),
    "HAF-329.18.600,Soft-Close Hinge 110,Hafele,Hardware & locks,520,480,440,18,per_piece,scheduled,3,1,1,Clip-on hinge for 16mm board",
  ].join("\n");
}
