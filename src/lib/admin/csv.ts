/**
 * A minimal RFC 4180 reader.
 *
 * Quoted fields may contain commas and doubled quotes. Rows are read line
 * by line rather than character by character across the whole file, which
 * means a newline *inside* a quoted field is not supported — the same
 * limitation `prisma/import-catalogue.ts` has carried since the first
 * import, and for the same reason: no export this catalogue has ever been
 * given contains one, and reading the file as lines keeps the parser
 * small enough to be obviously correct.
 *
 * A UTF-8 BOM is stripped. Excel writes one on every "Save as CSV", and
 * without this the first header is `﻿sku`, which matches nothing and
 * makes a perfectly good file look like it has no SKU column at all.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    return Object.fromEntries(header.map((key, i) => [key, (cells[i] ?? "").trim()]));
  });
}

/** The header as written, for telling someone which column they misspelled. */
export function csvHeader(text: string): string[] {
  const first = text.replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim() !== "");
  return first ? splitRow(first).map((h) => h.trim().toLowerCase()) : [];
}

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}
