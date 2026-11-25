import {
  ParchaReadError,
  isParchaReaderConfigured,
  readParchaFile,
} from "@/lib/parcha-openai";

/**
 * Reading a Parcha upload.
 *
 * `src/lib/parcha.ts` turns *text* into lines. This module's job is to
 * decide, per file, whether text can be produced at all — and if so, to
 * produce it for real rather than pretending to.
 *
 * `OcrProvider` is the seam this file was built around: one class, one
 * environment variable, and a one-line change to `getOcrProvider`'s
 * selection, with nothing that calls it having to change. That is now
 * spent. `OpenAiOcrProvider` reads a photograph or a PDF for real through
 * `src/lib/parcha-openai.ts`, and it is returned whenever
 * `OPENAI_API_KEY` is set.
 *
 * With that key unset the provider still reports itself unconfigured and
 * `decideExtractionAction` still routes every photograph and PDF to a
 * human — the behaviour this app shipped with, kept deliberately as the
 * unconfigured state rather than replaced by an error. A deploy waiting
 * on an OpenAI account is a deploy where uploads still work; they are
 * just read by a person.
 *
 * CSV is different again: reading it needs no model and no dependency, so
 * it has always been a genuine capability and is implemented for real in
 * `extractCsvLines`.
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
 * Reads the file with a vision model.
 *
 * A thin adapter on purpose: the prompt, the response schema, the JSON
 * validation and the rendering back to typed lines all live in
 * `src/lib/parcha-openai.ts`, so this file keeps its one job — deciding
 * *whether* a file can be read — and does not also become the place model
 * behaviour is tuned.
 *
 * `configured` is read at construction rather than per call so that
 * `decideExtractionAction` and the actual read cannot disagree within one
 * request about whether a reader exists.
 */
class OpenAiOcrProvider implements OcrProvider {
  readonly configured: boolean;

  constructor() {
    this.configured = isParchaReaderConfigured();
  }

  async extractText(input: { buffer: Buffer; contentType: string }): Promise<string> {
    if (!this.configured) throw new OcrNotConfiguredError();
    const reading = await readParchaFile({
      buffer: input.buffer,
      contentType: input.contentType,
      filename: "parcha",
    });
    return reading.text;
  }
}

/**
 * Selects the active OCR provider.
 *
 * OpenAI when `OPENAI_API_KEY` is set, and the not-configured provider
 * otherwise — never a stub that returns a plausible-looking list. The
 * whole point of `configured` being on the interface is that "we cannot
 * read this" is a routing decision made before any bytes move, not an
 * error a customer discovers after uploading.
 */
export function getOcrProvider(): OcrProvider {
  const openai = new OpenAiOcrProvider();
  return openai.configured ? openai : new NotConfiguredOcrProvider();
}

/** Re-exported so callers that already depend on this module for file
    routing do not need a second import to catch a read failure. */
export { ParchaReadError };

/** ---- File-type routing --------------------------------------------------- */

export type ParchaFileKind = "csv" | "xlsx" | "pdf" | "image" | "unknown";

const CSV_CONTENT_TYPES = new Set(["text/csv", "application/csv", "text/plain"]);
const XLSX_CONTENT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

/**
 * What the first bytes say the file actually is.
 *
 * `classifyFile` below reads a filename and a `Content-Type`, and both
 * are supplied by whoever is uploading: an attacker picks them, and an
 * ordinary browser gets them wrong often enough that neither can be
 * trusted on its own. The bytes cannot be renamed. So this is asked
 * first, and the declared name only decides cases the magic numbers
 * cannot settle.
 *
 * What this buys in practice is narrow and worth stating plainly,
 * because the extract route is already the safest caller — it persists
 * nothing and the bytes live for one request. The gain is that a file
 * which is not what it claims stops being routed as though it were: an
 * executable renamed `.jpg` no longer reaches the OCR path as an image,
 * it falls to `unknown` and goes to a person. The submission path
 * (`parcha-submissions.ts`), which *does* keep the file, gains more.
 *
 * Returns `null` rather than `"unknown"` when nothing matches, because
 * "these bytes are not a format I recognise" and "this file cannot be
 * read" are different statements — a CSV has no magic number at all, so
 * a null here is the normal case for the one format that is plain text.
 */
export function sniffFileKind(head: Uint8Array): ParchaFileKind | null {
  const starts = (...bytes: number[]): boolean =>
    bytes.every((b, i) => head[i] === b);

  /* `%PDF-` */
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf";
  /* PNG's signature, including the CRLF pair that catches a transfer
     which has mangled line endings. */
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image";
  /* JPEG: any SOI followed by a marker. */
  if (starts(0xff, 0xd8, 0xff)) return "image";
  /* RIFF container; the form type at offset 8 is what makes it a WEBP
     rather than a WAV. */
  if (starts(0x52, 0x49, 0x46, 0x46)) {
    const form = String.fromCharCode(...head.slice(8, 12));
    return form === "WEBP" ? "image" : null;
  }
  /* ISO base media: `ftyp` at offset 4, then a brand. HEIC and HEIF are
     what a recent iPhone sends, which is most photographs of a parcha. */
  if (String.fromCharCode(...head.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...head.slice(8, 12));
    return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)
      ? "image"
      : null;
  }
  /* XLSX is a zip. So is a great deal else, which is why this returns
     `xlsx` rather than something more confident: the decision it feeds
     sends xlsx to a person either way, so a zip that is not a
     spreadsheet lands in the same place it would have anyway. */
  if (starts(0x50, 0x4b, 0x03, 0x04)) return "xlsx";
  /* The old OLE compound-document container: a real `.xls`. */
  if (starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "xlsx";

  return null;
}

/** How many bytes `sniffFileKind` needs. Every signature above fits. */
export const SNIFF_BYTES = 16;

/**
 * What kind of file this is, for the purpose of deciding whether it can
 * be read.
 *
 * **The real bytes win when they say anything**, via `sniffFileKind` —
 * pass `head` wherever the caller has them, which is everywhere that
 * matters. The filename's extension and then the `Content-Type` decide
 * the rest: the generic types browsers send
 * (`application/octet-stream`, or `text/plain` for a CSV with no
 * explicit MIME mapping) and CSV, which has no signature to find.
 *
 * `head` is optional so that callers holding only metadata — and tests
 * covering the declared-type behaviour — keep working unchanged. A
 * caller that has the bytes and does not pass them is not wrong, only
 * trusting a name it did not have to.
 */
export function classifyFile(
  contentType: string,
  originalName: string,
  head?: Uint8Array,
): ParchaFileKind {
  const ct = contentType.toLowerCase().trim();
  const ext = (originalName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

  /* Asked before anything the uploader chose. */
  if (head && head.length > 0) {
    const sniffed = sniffFileKind(head);
    if (sniffed) return sniffed;
    /* The bytes are not a format known here. A name claiming otherwise
       is the case this check exists for, so the claim is refused rather
       than believed: `unknown` routes to a person, which is the right
       answer for a file nobody can identify. CSV is the exception — it
       is plain text with no signature, so a `.csv` name with
       unrecognised bytes is simply a CSV. */
    if (ext === "csv" || CSV_CONTENT_TYPES.has(ct)) return "csv";
    return "unknown";
  }

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
