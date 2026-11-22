"""Turn extraction runs into one spreadsheet a person can price and approve.

The join between the two halves of this pipeline:
`extract-catalogue-images.py` says what was found in each PDF and
`enhance-product-images.py` says what condition it is in, and this puts
both in front of a human with a thumbnail, a blank price column and a
Sell? column.

    .venv/bin/python research/build-image-workbook.py \
        --runs research/data/extracted/* \
        --out research/data/extracted/catalogue-images.xlsx \
        --categories research/data/categories.json

One sheet per brand, one row per distinct image. Every row carries the
things that have to travel together for the picture to be worth
anything — brand, series, catalogue number, page, source PDF, resolution,
quality grade and the file itself — which is §7 of the brief in a form
somebody can actually read.

**Two columns decide what happens next, and only a person fills them
in.** `Sell?` or a highlight marks the row for import; `Your price (₹)`
is what the customer pays. Neither is ever guessed: see
`prisma/import-approved-sheet.ts`, which refuses a highlighted row with
no price rather than falling back to the catalogue's MRP.

**`SKU confidence` is the column to read first.** `below` means the page
printed that code directly under that photograph. `beside` means a code
was printed next to it, which in a price-list layout is frequently a
different product's row — a candidate for a person to confirm. `none`
means nothing identified it. Only `below` is a fact.
"""

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

import cv2

# Grading lives in one place. Importing it rather than re-implementing it
# means the grade in this spreadsheet is the same grade the pipeline acts
# on, which is the only way the sheet can be trusted as a record.
_enhance_path = Path(__file__).with_name("enhance-product-images.py")
_spec = importlib.util.spec_from_file_location("enhance", _enhance_path)
_enhance = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_enhance)

load_on_white = _enhance.load_on_white
grade = _enhance.grade

HEADERS = [
    ("Sell?", 7),
    ("Picture", 14),
    ("Product name", 38),
    ("Series", 16),
    ("Code / SKU", 18),
    ("SKU confidence", 14),
    ("Other codes nearby", 26),
    ("Category", 24),
    ("Unit", 13),
    ("GST %", 7),
    ("Catalogue price (₹)", 16),
    ("Your price (₹)", 14),
    ("Resolution", 13),
    ("Quality", 16),
    ("Page", 6),
    ("Source PDF", 26),
    ("Image file", 24),
    ("Notes", 38),
]

UNITS = [
    "per piece",
    "per sqft",
    "per running ft",
    "per bag",
    "per litre",
    "per kg",
    "per visit",
]

GUIDE = [
    ("What this is", True),
    ("", False),
    ("One row per distinct picture found in the supplier PDFs, with what the "
     "page printed beside it and what condition the picture is in. Nothing "
     "here is on the website yet.", False),
    ("", False),
    ("Read the SKU confidence column first", True),
    ("", False),
    ("below — the catalogue printed that code directly under that photograph. "
     "This is a fact and can be trusted.", False),
    ("row — the picture sits in a table row with exactly one code beside it: "
     "photo, code, description, price, left to right. The row is the unit, so "
     "this match is sound.", False),
    ("beside — several codes were printed next to the picture. That is a photo "
     "grid beside a price table, and the nearest code is routinely another "
     "product's. Confirm it before selling.", False),
    ("none — nothing on the page identified the picture. Usually a lifestyle "
     "shot, a colour swatch, or a photo priced across a matrix of codes.", False),
    ("", False),
    ("What to do", True),
    ("", False),
    ("1. Highlight the rows you want to sell — any fill colour — or put an x "
     "in the Sell? column.", False),
    ("2. Fill in Your price (₹). This is what the customer pays, GST "
     "included. It is deliberately empty.", False),
    ("3. Fix the SKU on any row whose confidence is not 'below'.", False),
    ("4. Pick a Category from the dropdown.", False),
    ("5. Save, and tell Claude: upload them to the website.", False),
    ("", False),
    ("About Quality", True),
    ("", False),
    ("GOOD — big enough and sharp enough to publish as is.", False),
    ("LOW RESOLUTION — the PDF stored it small. It will be upscaled locally "
     "before publishing; nothing is invented.", False),
    ("BLURRY — soft focus or already upscaled by somebody else.", False),
    ("MANUAL REVIEW — more than one object in the picture, artwork running "
     "off the frame, or a background that cannot be turned white.", False),
    ("INVALID — too small or empty to use.", False),
]


def tidy_name(value):
    text = re.sub(r"\s+", " ", (value or "")).strip(" .,-|:;`")
    return text[:120]


def collect(run_dir, thumbs_dir, limit=0):
    """Grade every distinct image in one extraction run."""
    manifest = Path(run_dir) / "rows.json"
    if not manifest.exists():
        return []

    payload = json.loads(manifest.read_text())
    brand = payload.get("brand") or "Unknown"
    series = payload.get("series") or ""
    source_pdf = payload.get("source_pdf") or ""
    images_dir = Path(run_dir) / "images"

    # One row per distinct picture. A catalogue places the same photograph
    # against several finishes and the extractor records each placement;
    # the best-identified placement is the one worth showing.
    best = {}
    for row in payload.get("images", []):
        key = row.get("sha1") or row.get("file")
        rank = (
            {"below": 3, "row": 2, "beside": 1}.get(row.get("matchConfidence"), 0),
            len(row.get("item") or ""),
        )
        if key not in best or rank > best[key][0]:
            best[key] = (rank, row)

    rows = []
    for index, (_, row) in enumerate(best.values()):
        if limit and index >= limit:
            break

        path = images_dir / row["file"]
        if not path.exists():
            continue
        mask = images_dir / row["mask_file"] if row.get("mask_file") else None

        try:
            full, artwork_mask, trimmed, had_alpha, native = load_on_white(path, mask)
            status, facts = grade(full, artwork_mask, trimmed, had_alpha)
        except Exception as error:  # noqa: BLE001 - a bad file is a row, not a crash
            status, facts, trimmed = "INVALID", {"reason": str(error)[:80]}, None

        thumb_name = f"{Path(row['file']).stem}.jpg"
        if trimmed is not None:
            thumb = trimmed.copy()
            height, width = thumb.shape[:2]
            scale = 96 / max(height, width)
            if scale < 1:
                thumb = cv2.resize(
                    thumb,
                    (max(1, int(width * scale)), max(1, int(height * scale))),
                    interpolation=cv2.INTER_AREA,
                )
            cv2.imwrite(str(thumbs_dir / thumb_name), thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])
        else:
            thumb_name = None

        rows.append(
            {
                "brand": brand,
                "series": row.get("series") or series,
                "name": tidy_name(row.get("item")),
                "code": row.get("cat_nos") or "",
                "confidence": row.get("matchConfidence") or "none",
                "nearby": ", ".join((row.get("cat_nos_nearby") or [])[:4]),
                "price_text": row.get("price_text") or "",
                "page": row.get("folio"),
                "sourcePdf": source_pdf,
                "file": row["file"],
                "thumb": thumb_name,
                "nativeW": row.get("px_w"),
                "nativeH": row.get("px_h"),
                "artworkW": facts.get("width"),
                "artworkH": facts.get("height"),
                "status": status,
                "reason": facts.get("reason", ""),
                "orientation": row.get("orientation", ""),
            }
        )

    return rows


def price_from_text(text):
    """'`2,350' -> 2350.0, where the catalogue printed one at all."""
    if not text:
        return None
    digits = re.sub(r"[^\d.]", "", text)
    if not digits or digits == ".":
        return None
    try:
        return float(digits)
    except ValueError:
        return None


def write_workbook(path, by_brand, thumbs_dir, categories):
    from openpyxl import Workbook
    from openpyxl.drawing.image import Image as XLImage
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    book = Workbook()

    guide = book.active
    guide.title = "How to use this"
    guide.column_dimensions["A"].width = 104
    for text, heading in GUIDE:
        cell = guide.cell(row=guide.max_row + 1, column=1, value=text)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        if heading:
            cell.font = Font(bold=True, size=12)

    guide.cell(row=guide.max_row + 2, column=1, value="What was read").font = Font(bold=True)
    for brand, rows in sorted(by_brand.items()):
        confident = len([r for r in rows if r["confidence"] in ("below", "row")])
        pdfs = len({r["sourcePdf"] for r in rows})
        guide.cell(
            row=guide.max_row + 1,
            column=1,
            value=f"{brand}: {len(rows)} pictures from {pdfs} catalogue(s), "
            f"{confident} with a catalogue number printed underneath",
        )

    lists = book.create_sheet("Lists")
    for i, name in enumerate(categories, start=1):
        lists.cell(row=i, column=1, value=name)
    for i, unit in enumerate(UNITS, start=1):
        lists.cell(row=i, column=2, value=unit)
    lists.sheet_state = "hidden"

    header_fill = PatternFill("solid", fgColor="1F2A37")
    header_font = Font(bold=True, color="FFFFFF")
    grades = {
        "GOOD": "C6F6D5",
        "LOW_RESOLUTION": "FEF3C7",
        "BLURRY": "FED7AA",
        "MANUAL_REVIEW": "E9D5FF",
        "INVALID": "FECACA",
    }

    for brand, rows in sorted(by_brand.items()):
        title = re.sub(r"[\\/*?:\[\]]", "-", brand)[:31] or "Brand"
        sheet = book.create_sheet(title)
        column_of = {label: i for i, (label, _) in enumerate(HEADERS, start=1)}

        for column, (label, width) in enumerate(HEADERS, start=1):
            cell = sheet.cell(row=1, column=column, value=label)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            sheet.column_dimensions[get_column_letter(column)].width = width
        sheet.row_dimensions[1].height = 30
        sheet.freeze_panes = "C2"

        # Confident matches first: those are the rows worth pricing today.
        order = {"below": 0, "row": 1, "beside": 2, "none": 3}
        rows.sort(key=lambda r: (order.get(r["confidence"], 3), r["page"] or 0, r["code"]))

        for offset, row in enumerate(rows, start=2):
            sheet.row_dimensions[offset].height = 74

            sheet.cell(row=offset, column=column_of["Product name"], value=row["name"])
            sheet.cell(row=offset, column=column_of["Series"], value=row["series"])
            sheet.cell(row=offset, column=column_of["Code / SKU"], value=row["code"])
            sheet.cell(row=offset, column=column_of["SKU confidence"], value=row["confidence"])
            sheet.cell(row=offset, column=column_of["Other codes nearby"], value=row["nearby"])
            sheet.cell(row=offset, column=column_of["Unit"], value="per piece")
            sheet.cell(row=offset, column=column_of["GST %"], value=18)

            printed = price_from_text(row["price_text"])
            if printed:
                cell = sheet.cell(
                    row=offset, column=column_of["Catalogue price (₹)"], value=printed
                )
                cell.number_format = "#,##0.00"
            sheet.cell(
                row=offset, column=column_of["Your price (₹)"]
            ).number_format = "#,##0.00"

            resolution = (
                f"{row['artworkW']}x{row['artworkH']}"
                if row.get("artworkW")
                else f"{row['nativeW']}x{row['nativeH']}"
            )
            sheet.cell(row=offset, column=column_of["Resolution"], value=resolution)

            quality = sheet.cell(
                row=offset,
                column=column_of["Quality"],
                value=row["status"].replace("_", " "),
            )
            if row["status"] in grades:
                quality.fill = PatternFill("solid", fgColor=grades[row["status"]])

            sheet.cell(row=offset, column=column_of["Page"], value=row["page"])
            sheet.cell(row=offset, column=column_of["Source PDF"], value=row["sourcePdf"])
            sheet.cell(row=offset, column=column_of["Image file"], value=row["file"])

            notes = row["reason"]
            if row.get("orientation") not in ("as-stored", "rendered", "unchecked", ""):
                notes = f"{notes}; placement {row['orientation']} — corrected".strip("; ")
            sheet.cell(row=offset, column=column_of["Notes"], value=notes)

            for label in ("Product name", "Notes", "Other codes nearby", "Source PDF"):
                sheet.cell(row=offset, column=column_of[label]).alignment = Alignment(
                    wrap_text=True, vertical="center"
                )

            if row.get("thumb"):
                thumb = thumbs_dir / row["thumb"]
                if thumb.exists():
                    picture = XLImage(str(thumb))
                    picture.anchor = f"{get_column_letter(column_of['Picture'])}{offset}"
                    sheet.add_image(picture)

        last = max(sheet.max_row, 2)
        if categories:
            validation = DataValidation(
                type="list", formula1=f"=Lists!$A$1:$A${len(categories)}", allow_blank=True
            )
            sheet.add_data_validation(validation)
            letter = get_column_letter(column_of["Category"])
            validation.add(f"{letter}2:{letter}{last}")

        units = DataValidation(
            type="list", formula1=f"=Lists!$B$1:$B${len(UNITS)}", allow_blank=True
        )
        sheet.add_data_validation(units)
        letter = get_column_letter(column_of["Unit"])
        units.add(f"{letter}2:{letter}{last}")

        sheet.auto_filter.ref = f"A1:{get_column_letter(len(HEADERS))}{last}"

    book.save(path)


def main():
    parser = argparse.ArgumentParser(description="Extraction runs -> one review workbook.")
    parser.add_argument("--runs", nargs="+", required=True, help="extraction output dirs")
    parser.add_argument("--out", required=True, help="the .xlsx to write")
    parser.add_argument("--categories", help="JSON of storefront category names")
    parser.add_argument("--limit", type=int, default=0, help="cap rows per run, for a look")
    args = parser.parse_args()

    categories = []
    if args.categories and Path(args.categories).exists():
        loaded = json.loads(Path(args.categories).read_text())
        categories = loaded.get("categories", []) if isinstance(loaded, dict) else list(loaded)

    out_path = Path(args.out)
    thumbs_dir = out_path.parent / "workbook-thumbs"
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    by_brand = {}
    for run in args.runs:
        run_path = Path(run)
        if not (run_path / "rows.json").exists():
            continue
        print(f"grading {run_path.name} …", flush=True)
        for row in collect(run_path, thumbs_dir, args.limit):
            by_brand.setdefault(row["brand"], []).append(row)

    if not by_brand:
        sys.exit("no extraction runs found")

    write_workbook(out_path, by_brand, thumbs_dir, categories)

    print()
    total = 0
    for brand, rows in sorted(by_brand.items()):
        confident = len([r for r in rows if r["confidence"] in ("below", "row")])
        good = len([r for r in rows if r["status"] == "GOOD"])
        total += len(rows)
        print(f"  {brand:<14} {len(rows):>5} pictures · {confident:>4} with a sure SKU · {good:>4} GOOD")
    print(f"\n{total} rows -> {out_path}")


if __name__ == "__main__":
    main()
