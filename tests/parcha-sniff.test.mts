import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { classifyFile, sniffFileKind, SNIFF_BYTES } = await import(
  "@/lib/parcha-extract"
);

/**
 * What a file is, decided by its bytes rather than by its name.
 *
 * `classifyFile` read a filename and a `Content-Type`, and an uploader
 * chooses both. The extract route is the safest possible caller — it
 * persists nothing and the bytes live for one request — so this was
 * never urgent, but it was the one place where a file could be routed
 * as something it is not: an executable named `.jpg` went to the OCR
 * path as an image.
 *
 * The rule these tests pin down is narrow and worth stating: **bytes
 * that are recognised win outright; bytes that are not recognised make
 * the file `unknown`, except for CSV**, which is plain text with no
 * signature to find and so can only ever be identified by its name.
 * `unknown` is not a failure — it routes to a person, which is the
 * right destination for a file nobody can identify.
 */

const head = (...bytes: number[]): Uint8Array => {
  const out = new Uint8Array(SNIFF_BYTES);
  out.set(bytes.slice(0, SNIFF_BYTES));
  return out;
};

const ascii = (text: string, offset = 0): number[] => {
  const out: number[] = new Array(offset).fill(0);
  for (const ch of text) out.push(ch.charCodeAt(0));
  return out;
};

const PDF = head(...ascii("%PDF-1.7"));
const PNG = head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = head(0xff, 0xd8, 0xff, 0xe0);
const WEBP = head(...ascii("RIFF"), ...ascii("WEBP", 4));
const HEIC = head(...ascii("ftypheic", 4));
const ZIP = head(0x50, 0x4b, 0x03, 0x04);
const OLE = head(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
/* Mach-O 64-bit, which is what an executable on this machine looks like. */
const MACHO = head(0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01);

describe("sniffFileKind", () => {
  it("recognises the formats a parcha actually arrives as", () => {
    assert.equal(sniffFileKind(PDF), "pdf");
    assert.equal(sniffFileKind(PNG), "image");
    assert.equal(sniffFileKind(JPEG), "image");
    assert.equal(sniffFileKind(WEBP), "image");
    /* A recent iPhone sends HEIC, which is most photographs of a
       handwritten list. */
    assert.equal(sniffFileKind(HEIC), "image");
    assert.equal(sniffFileKind(ZIP), "xlsx");
    assert.equal(sniffFileKind(OLE), "xlsx");
  });

  it("does not mistake every RIFF container for an image", () => {
    /* RIFF is a container, not a format: the form type at offset 8 is
       what makes it a WEBP rather than a WAV. */
    const wav = head(...ascii("RIFF"), ...ascii("WAVE", 4));
    assert.equal(sniffFileKind(wav), null);
  });

  it("does not mistake every ISO-media file for an image", () => {
    const mp4 = head(...ascii("ftypmp42", 4));
    assert.equal(sniffFileKind(mp4), null);
  });

  it("returns null rather than unknown for bytes it cannot place", () => {
    /* The distinction matters: "not a format I know" is the normal case
       for CSV, which has no signature at all. */
    assert.equal(sniffFileKind(MACHO), null);
    assert.equal(sniffFileKind(head(...ascii("Cement 50kg 20"))), null);
  });

  it("does not read past the bytes it was given", () => {
    assert.equal(sniffFileKind(new Uint8Array(0)), null);
    assert.equal(sniffFileKind(new Uint8Array([0x25, 0x50])), null);
  });
});

describe("classifyFile, when it can see the bytes", () => {
  it("refuses a disguise", () => {
    /* The reason any of this exists. Both the name and the content type
       say image; the bytes say executable. It must not reach the reader
       as an image. */
    assert.equal(classifyFile("image/jpeg", "parcha.jpg", MACHO), "unknown");
  });

  it("believes the bytes over a wrong name, in both directions", () => {
    assert.equal(classifyFile("image/png", "list.png", PDF), "pdf");
    assert.equal(classifyFile("application/pdf", "scan.pdf", JPEG), "image");
  });

  it("still reads a CSV, which has no signature to find", () => {
    /* The one format the bytes cannot identify. A `.csv` name with
       unrecognised bytes is simply a CSV — and so is a `text/csv`
       content type with a name that says nothing. */
    const text = head(...ascii("Cement 50kg 20"));
    assert.equal(classifyFile("text/csv", "list.csv", text), "csv");
    assert.equal(classifyFile("text/csv", "list", text), "csv");
    assert.equal(classifyFile("application/octet-stream", "list.csv", text), "csv");
  });

  it("does not let a CSV name smuggle other bytes through as text", () => {
    /* Recognised bytes win even against a `.csv` name: this is a PDF
       whatever it is called, and routing it as a CSV would hand the
       reader binary to parse as lines. */
    assert.equal(classifyFile("text/csv", "list.csv", PDF), "pdf");
  });
});

describe("classifyFile, with no bytes to look at", () => {
  it("keeps the declared-type behaviour unchanged", () => {
    /* The submission path holds a storage key rather than a buffer —
       and that storage is behind the egress cap today — so it calls this
       with metadata only. That path must keep working exactly as it
       did. */
    assert.equal(classifyFile("image/jpeg", "parcha.jpg"), "image");
    assert.equal(classifyFile("application/pdf", "scan.pdf"), "pdf");
    assert.equal(classifyFile("text/csv", "list.csv"), "csv");
    assert.equal(
      classifyFile(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "sheet.xlsx",
      ),
      "xlsx",
    );
    assert.equal(classifyFile("application/x-msdownload", "setup.exe"), "unknown");
  });

  it("falls back to the extension for the generic types browsers send", () => {
    assert.equal(classifyFile("application/octet-stream", "parcha.heic"), "image");
    assert.equal(classifyFile("text/plain", "list.csv"), "csv");
  });
});
