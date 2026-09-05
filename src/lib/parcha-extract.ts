/**
 * Reading a Parcha upload.
 *
 * `src/lib/parcha.ts` turns *text* into lines. This module's job is to
 * decide, per file, whether text can be produced at all — and if so, to
 * produce it for real rather than pretending to.
 *
 * There is no OCR provider behind this app. `OcrProvider` exists so that
 * changes when one is added: one class, one environment variable, and a
 * one-line change to `getOcrProvider`'s selection — nothing that calls it
 * has to change. Until then `getOcrProvider()` always returns a provider
 * that reports itself unconfigured, and `decideExtractionAction` below
 * routes every photograph and PDF to a human rather than calling it.
 *
 * CSV is different: reading it needs no OCR and no dependency, so it is a
 * genuine capability and is implemented for real in `extractCsvLines`.
 */

/** Thrown by `NotConfiguredOcrProvider` if something ever calls it despite
 * `decideExtractionAction` routing around it. A clear failure, not a
 * silent empty result that could be mistaken for "read, and empty". */
export class OcrNotConfiguredError extends Error {
  constructor() {
    super(
      "No OCR provider is configured. Photographs and PDFs must be read by a person.",
    );
    this.name = "OcrNotConfiguredError";
  }
}

export interface OcrProvider {
  /** Whether this provider can actually be called. Checked by
   * `decideExtractionAction` before anything touches network or file
   * bytes, so an unconfigured provider is never the reason a submission
   * fails — it is the reason one goes to manual review instead. */
  readonly configured: boolean;
  /** Raw text read from the image or PDF, in the same shape a typed
   * paste would arrive in — one material per line. Only ever called when
   * `configured` is true. */
  extractText(input: { buffer: Buffer; contentType: string }): Promise<string>;
}

class NotConfiguredOcrProvider implements OcrProvider {
  readonly configured = false;

  async extractText(): Promise<string> {
    throw new OcrNotConfiguredError();
  }
}

/**
 * Selects the active OCR provider. Always the not-configured one today —
 * there is no `OCR_...` environment variable anywhere in this app, and
 * inventing one that is never set would be exactly the kind of simulated
 * capability this codebase refuses to ship. Adding a real provider means
 * adding its class here, reading its key through `src/lib/env.ts` (the
 * one file this slice does not own), and returning it here when
 * configured — nothing outside this module changes.
 */
export function getOcrProvider(): OcrProvider {
  return new NotConfiguredOcrProvider();
}

/** ---- File-type routing --------------------------------------------------- */

export type ParchaFileKind = "csv" | "xlsx" | "pdf" | "image" | "unknown";

const CSV_CONTENT_TYPES = new Set(["text/csv", "application/csv", "text/plain"]);
const XLSX_CONTENT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

/**
 * What kind of file this is, for the purpose of deciding whether it can
 * be read. Content type first — it is re-checked against the real bytes
 * before a `StoredFile` reaches `STORED` (see the schema comment) — with
 * the declared filename's extension as a fallback for the generic types
 * browsers sometimes send (`application/octet-stream`, or `text/plain`
 * for a CSV with no explicit MIME mapping).
 */
export function classifyFile(contentType: string, originalName: string): ParchaFileKind {
  const ct = contentType.toLowerCase().trim();
  const ext = (originalName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";

  if (CSV_CONTENT_TYPES.has(ct)) return "csv";
  if (XLSX_CONTENT_TYPES.has(ct)) return "xlsx";
  if (ct === "application/pdf") return "pdf";
  if (ct.startsWith("image/")) return "image";

  return "unknown";
}

export interface ExtractionDecision {
  action: "parse_csv" | "run_ocr" | "manual_review";
  /** Set only for `manual_review` — the reason, in words a staff member
   * can act on. Never shown to the customer as a claim about what was
   * read, only what will be. */
  note?: string;
}

const NO_OCR_NOTE =
  "There is no OCR provider configured. A team member will open this file and enter the list by hand.";

const XLSX_NOTE =
  "XLSX files are not read automatically — parsing the real spreadsheet format needs a dependency this app does not carry. A team member will open the file and enter the list by hand.";

const UNKNOWN_NOTE =
  "Quoin cannot automatically read this file type. A team member will open it and enter the list by hand.";

/**
 * The one place that decides whether a file gets read by a machine or by
 * a person. Pure and total over `ParchaFileKind`, so a new file kind is a
 * type error here rather than a silently-unhandled case at upload time.
 *
 * `ocrConfigured` is threaded in rather than read from `getOcrProvider()`
 * directly so this stays testable without importing the provider, and so
 * the day a provider exists this function's behaviour for `pdf`/`image`
 * changes without touching a single line of it.
 */
export function decideExtractionAction(
  kind: ParchaFileKind,
  ocrConfigured: boolean,
): ExtractionDecision {
  if (kind === "csv") return { action: "parse_csv" };
  if (kind === "xlsx") return { action: "manual_review", note: XLSX_NOTE };
  if (kind === "pdf" || kind === "image") {
    return ocrConfigured ? { action: "run_ocr" } : { action: "manual_review", note: NO_OCR_NOTE };
  }
  return { action: "manual_review", note: UNKNOWN_NOTE };
}

/** ---- CSV --------------------------------------------------------------- */

/** Strips a UTF-8 BOM, which spreadsheet software writes routinely and
 * `Buffer#toString("utf8")` does not remove on its own. */
export function decodeCsvBuffer(buffer: Buffer): string {
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

/**
 * A minimal RFC 4180 reader: quoted fields, `""` as an escaped quote
 * inside one, commas and newlines inside quotes ignored as separators,
 * and `\r\n` or bare `\n` line endings. Hand-written rather than a
 * dependency — a full CSV library is more than one export's worth of
 * spreadsheet dialects, and this only has to read what a phone or a
 * spreadsheet actually writes.
 */
export function parseCsvRows(csvText: string): string[][] {
  const text = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyField = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      sawAnyField = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      sawAnyField = true;
    } else if (ch === "\r") {
      /* Swallowed; `\n` (bare or following `\r`) ends the row. */
      continue;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      sawAnyField = false;
    } else {
      field += ch;
      sawAnyField = true;
    }
  }

  /* A final line with no trailing newline still has to land in the
     output — CSV exports from a phone frequently omit it. */
  if (sawAnyField || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Words that show up in a header row and essentially nowhere else in a
 * materials list. Best-effort on purpose: a materials list has no schema
 * to check a header against, so this is a heuristic, not a parser rule —
 * documented here rather than left to look like exact science.
 */
const HEADER_WORDS = new Set([
  "s", "no", "sno", "sl", "slno", "sr", "srno", "number", "date",
  "item", "items", "material", "materials", "description", "desc", "name",
  "product", "products", "particulars", "particular",
  "qty", "quantity", "unit", "units", "uom",
  "sku", "code", "hsn",
  "remarks", "remark", "notes", "note", "comment", "comments",
  "rate", "price", "amount", "total", "value",
]);

function looksLikeHeader(cells: string[]): boolean {
  return cells.every((cell) => {
    const words = cell
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    return words.length > 0 && words.every((w) => HEADER_WORDS.has(w));
  });
}

/**
 * Turns CSV text into row-strings shaped exactly like a typed parcha
 * line: `parseParcha` already knows how to read "Cement 40 bags", and a
 * row with the name in one column and the quantity in another
 * (`Cement,40,bags`) becomes that same string by joining its non-empty
 * cells with a space. A row is one material, not one cell per line — a
 * name and its quantity split across columns are one line, not two.
 *
 * Blank rows are dropped. The first row that has any content is checked
 * against `looksLikeHeader` and dropped if it matches — a header can
 * appear after leading blank rows, which a plain "skip row 0" would miss.
 *
 * A row that is prose rather than a material ("please deliver before
 * 6pm") is not detected or dropped: there is no reliable way to tell it
 * apart from a real line with an unusual name, and dropping real lines
 * silently is worse than passing one odd line through. It becomes a
 * `ParchaLine` with the whole row as its search term, at which point
 * matching — not extraction — is what shows it as a poor match.
 */
export function extractCsvLines(csvText: string): string[] {
  const rows = parseCsvRows(csvText);
  const lines: string[] = [];
  let sawFirstContentRow = false;

  for (const cells of rows) {
    const nonEmpty = cells.map((c) => c.trim()).filter(Boolean);
    if (nonEmpty.length === 0) continue;

    if (!sawFirstContentRow) {
      sawFirstContentRow = true;
      if (looksLikeHeader(nonEmpty)) continue;
    }

    lines.push(nonEmpty.join(" "));
  }

  return lines;
}
