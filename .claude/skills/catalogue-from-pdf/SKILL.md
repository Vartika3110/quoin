---
name: catalogue-from-pdf
description: Turn supplier PDF catalogues into a reviewable product spreadsheet, then put the approved rows on the website. Use this whenever the user attaches or points at one or more supplier/brand/dealer catalogue PDFs and says "extract" (or asks for the products, images, codes or prices out of them, or for an Excel of them) — it pulls every product photograph out with its name, series, code and printed price, writes one .xlsx with a sheet per brand, a thumbnail in every row and an empty "Your price" column, and hands it back for approval. Use it again when the user returns an edited/reviewed spreadsheet and says "upload them to the website" (or "upload the highlighted ones", "put these live", "add them to the database") — it reads back which rows were highlighted and priced and imports exactly those into Prisma as live products with their photography. Also use it for any follow-up about that workbook: re-extracting a brand, fixing rows the extraction got wrong, or re-running an import.
---

# Supplier PDF → spreadsheet → live products

## What this is for

Quoin's assortment arrives as dealer PDFs — a Hindware catalogue, a
Jaquar price list, four brands in one email. Each is a few hundred pages
of photographs with a code, a description and an MRP printed beside them.
Typing those into a catalogue by hand is the slow way to be wrong.

The pipeline is three commands and one human decision in the middle:

```
supplier PDFs ──extract──▶ catalogue-extract.xlsx ──[ human highlights
                                                      and prices ]──▶
reviewed.xlsx ──read──▶ approved.json ──import──▶ live products
```

**The human decision is the price**, and it is the reason this is two
phases rather than one script. The catalogue's MRP is extracted and put
in the sheet for reference; what Quoin actually charges is never guessed.
A highlighted row with an empty price column is refused by name, not
filled in with the MRP.

## Phase 1 — "extract"

Trigger: the user attaches PDFs, or names ones already on disk, and says
extract.

**Step 1. Find the PDFs and name their brands.** Use the paths the user
gave. If they said "the PDFs I uploaded" and attached nothing, look in
the working directory, `~/Downloads` and `~/Desktop` for recent PDFs and
confirm the list with them before reading several hundred pages.

The extractor reads the brand off the document, but only when the
evidence is clear, and it tells you what it decided. If you already know
the brand — the user said "the Hindware one" — pass `--brand`, one per
PDF in the same order as the PDFs.

**Step 2. Refresh the dropdown lists** so the sheet offers the
storefront's real categories and recognises brands the catalogue already
carries:

```bash
npm run catalogue:lists -- research/data/categories.json
```

**Step 3. Extract.** Output goes under `research/data/sheets/<name>/`,
which is gitignored — images, thumbnails, a JSON manifest and the
workbook:

```bash
.venv/bin/python research/extract-catalogue-sheet.py \
  research/data/sheets/2026-11-18 \
  "Hindware.pdf" "CG VOL. 22_2026-27_web.pdf" \
  --brand Hindware --brand Jaquar \
  --categories research/data/categories.json \
  --name catalogue-extract
```

A 200-page catalogue takes a few minutes and renders a JPEG per product,
so run it in the background and report the per-brand counts it prints at
the end. On a document nobody has seen before, run `--pages 1-12` first
and look at the manifest: if the codes and prices are landing in the
right columns, run the whole thing.

**Step 4. Check it before handing it over.** Read the manifest JSON and
look at ten or so rows — code, price, name, series — and open one or two
of the rendered JPEGs. The things that actually go wrong are a brand
guessed wrong, prices read from a specification table instead of a price
list, and names that are really sizes. Say what you found; do not present
a sheet you have not looked at.

**Step 5. Hand over the workbook** with `SendUserFile`, and say in two
lines: how many products per brand, how many carry a printed price, and
that they should highlight the rows to sell, fill **Your price (₹)**,
save, and say *upload them to the website*. The sheet's first tab repeats
that, so do not restate it at length.

## Phase 2 — "upload them to the website"

Trigger: the user returns the reviewed workbook and says to upload,
publish, or put the highlighted rows live.

**Step 1. Read the approvals back.** Point `--images` at the extraction
run's `images/` directory if the workbook has been moved away from it
(it usually has — it comes back from a download folder):

```bash
.venv/bin/python research/read-approved-sheet.py \
  ~/Downloads/catalogue-extract.xlsx \
  research/data/sheets/2026-11-18/approved.json \
  --images research/data/sheets/2026-11-18/images
```

A row counts as approved when any cell in it carries a fill colour, or
when its **Sell?** column is marked. The reader lists every highlighted
row it had to decline — almost always a missing price — and those are
the user's to fix, not yours to fill in.

**Step 2. Dry run, and show the user what will happen:**

```bash
npm run db:import-sheet -- research/data/sheets/2026-11-18/approved.json --dry-run
```

Report the counts and every `SKIPPED` line. If rows were declined or
skipped, say so **before** importing — a row the user highlighted and
expected to go live must never disappear silently.

**Step 3. Import, once the user has seen the dry run.** This writes to
the live database:

```bash
npm run db:import-sheet -- research/data/sheets/2026-11-18/approved.json
```

**Step 4. Commit the photography.** The import copies each picture into
`public/catalogue/<brand>/`, which is committed to the repo rather than
served from object storage. Products deployed without those files show a
swatch instead of a photograph, so the new files have to be committed
with the rest of the work. This repo batches its pushes — leave the
change in the tree and tell the user it is there, rather than committing
unasked.

**Step 5. Confirm what went live**: products created, updated, variants
priced, and anything skipped. A product is visible on the storefront when
it is active and has at least one active variant, which is exactly what
this import creates — so "imported" and "live" are the same thing here,
and say so plainly.

## Rules this pipeline does not bend

- **No price is ever invented.** Not from MRP, not from a competitor, not
  from a sibling SKU. An approved row without a price is declined.
- **Prices are GST-inclusive integer paise.** The sheet is in rupees and
  the conversion happens once, in the reader. Never add tax on top of a
  catalogue figure — Quoin's prices already contain it.
- **Nothing is imported as `INSTANT`,** and `stockTracked` is never set
  by an importer. A PDF carries no fact about what a dark store holds.
- **Categories are matched, never created.** The sheet's dropdown holds
  the storefront's own categories; anything else is a typo and is
  refused.
- **A photograph already on a product is not overwritten** unless the
  user asks (`--replace-images`).
- **Only highlighted rows are imported.** Not "everything with a price",
  not "everything that looked good". The highlighting is the approval.

## When to use the other extractor instead

`research/extract-brand-catalogue.py` handles Jaquar and Ozone with a
layout written out per brand in its `BRANDS` table, and for those two it
reads the page more precisely than this one does. Use it when the brand
is already in that table and the job is a full, careful import of that
catalogue. This skill's extractor is the one for a PDF nobody has
described yet — it anchors on photographs rather than on a known grid, so
it works on anything, and says in the Notes column where it was unsure.

## Troubleshooting

| What you see | What it is |
| --- | --- |
| Rows named like `P0012-03` | No code was printed near the picture. The Notes column says so; the user renames them or the row is dropped. |
| Codes right, names are sizes (`500MM ANTHGREY`) | A dense spec table. The extractor moves those to **Variant / size** and names the product from the heading — check the heading was right. |
| Brand came out `UNKNOWN` | No brand name appeared often enough to be sure. Re-run with `--brand`. |
| Far too many rows | Lifestyle and banner shots got captions. `--keep-all` is off by default; if the count is still wrong, narrow with `--pages`. |
| `openpyxl`/`pdfplumber` missing | `python3 -m venv .venv && .venv/bin/pip install pdfplumber pillow pypdfium2 openpyxl pymupdf` |
| Reader found nothing approved | The user saved a copy without the highlighting, or highlighted the text colour rather than the fill. Ask them to use the fill/highlight button, or the Sell? column. |
