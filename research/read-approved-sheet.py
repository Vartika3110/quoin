"""Read back the reviewed spreadsheet and report which rows were approved.

The other half of `extract-catalogue-sheet.py`. That one writes a sheet of
candidates; a human highlights the rows worth selling and fills in a
price; this reads the highlighting back and hands the approved rows to
`prisma/import-approved-sheet.ts`.

    .venv/bin/python research/read-approved-sheet.py sheet.xlsx approved.json
    ... --images path/to/images    # if the sheet has been moved away from them

**Highlighting is a fill colour on any cell in the row**, which is what
"highlight the ones you want" means in Excel, and an x in the Sell?
column does the same thing for anyone who would rather type. Nothing else
counts: a row that was merely edited is not a row that was chosen.

It writes nothing to the database and refuses nothing quietly — every row
it declines is listed, with the reason, so that a row meant to go live
cannot disappear between the spreadsheet and the storefront.
"""

import argparse
import json
import re
import sys
from pathlib import Path

from openpyxl import load_workbook

#: Sheets the extractor writes that hold no products.
NOT_A_BRAND = {"How to use this", "Lists"}

#: Header labels -> the key each becomes. Matched loosely (case, spaces
#: and punctuation ignored) so that a column renamed "Your Price" or
#: "your price (Rs)" in the spreadsheet still lands in the right place.
COLUMNS = {
    "sell": "sell",
    "picture": "picture",
    "productname": "name",
    "series": "series",
    "code": "code",
    "variantsize": "variant",
    "category": "category",
    "unit": "unit",
    "gst": "gstRatePct",
    "cataloguepricers": "cataloguePrice",
    "yourpricers": "yourPrice",
    "page": "page",
    "imagefile": "image",
    "notes": "notes",
}


def normalise(label):
    """'Catalogue price (₹)' -> 'cataloguepricers'. Rupees spelt either way."""
    text = str(label or "").lower().replace("₹", "rs").replace("%", "")
    return re.sub(r"[^a-z]", "", text)


def is_highlighted(cell):
    """Whether a cell carries a fill somebody applied by hand.

    openpyxl reports no fill as a pattern type of None, and the default
    "no colour" as either 00000000 or theme 0 — none of which is a
    highlight. Anything else is one, including the theme colours Excel's
    own highlight button applies, which is why a theme index that is not
    the default counts.
    """
    fill = cell.fill
    if fill is None or fill.patternType is None:
        return False

    colour = fill.fgColor
    if colour is None:
        return False

    if colour.type == "rgb":
        rgb = (colour.rgb or "").upper()
        return rgb not in ("", "00000000", "FFFFFFFF")
    if colour.type == "theme":
        # Theme 0 is the background itself; a tint on it is still a fill.
        return colour.theme != 0 or bool(colour.tint)
    if colour.type == "indexed":
        # 64 is "automatic", 65 the background. Both mean no fill.
        return colour.indexed not in (64, 65)
    return True


def to_paise(value):
    """A spreadsheet cell -> integer paise, or None.

    Accepts what people actually type: 4,250 · ₹4,250 · 4250.50 · "4250/-".
    Refuses anything with no number in it rather than importing a zero.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(round(float(value) * 100))

    cleaned = re.sub(r"[^\d.]", "", str(value))
    if not cleaned or cleaned == ".":
        return None
    try:
        return int(round(float(cleaned) * 100))
    except ValueError:
        return None


def read_sheet(sheet):
    """Approved rows and declined rows from one brand's sheet."""
    header = {}
    for cell in sheet[1]:
        key = COLUMNS.get(normalise(cell.value))
        if key:
            header[key] = cell.column

    missing = {"name", "code", "yourPrice"} - set(header)
    if missing:
        return [], [
            {
                "sheet": sheet.title,
                "row": 1,
                "reason": f"sheet has no {', '.join(sorted(missing))} column",
            }
        ]

    approved, declined = [], []

    for row in sheet.iter_rows(min_row=2):
        if all(cell.value in (None, "") for cell in row):
            continue

        def value(key):
            column = header.get(key)
            return row[column - 1].value if column else None

        marked = str(value("sell") or "").strip()
        chosen = bool(marked) or any(is_highlighted(cell) for cell in row)
        if not chosen:
            continue

        number = row[0].row
        name = str(value("name") or "").strip()
        code = str(value("code") or "").strip()
        price = to_paise(value("yourPrice"))

        problem = None
        if not code:
            problem = "no code — give it one, it is the product's SKU"
        elif not name:
            problem = "no product name"
        elif price is None:
            problem = "highlighted but Your price (₹) is empty"
        elif price <= 0:
            problem = f"Your price reads {value('yourPrice')!r}"

        if problem:
            declined.append(
                {"sheet": sheet.title, "row": number, "code": code, "reason": problem}
            )
            continue

        gst = value("gstRatePct")
        approved.append(
            {
                "brand": sheet.title.strip(),
                "name": name,
                "code": code,
                "series": str(value("series") or "").strip(),
                "variant": str(value("variant") or "").strip(),
                "category": str(value("category") or "").strip(),
                "unit": str(value("unit") or "per piece").strip(),
                "gstRatePct": int(gst) if isinstance(gst, (int, float)) else None,
                "cataloguePricePaise": to_paise(value("cataloguePrice")),
                "pricePaise": price,
                "image": str(value("image") or "").strip(),
                "page": value("page"),
                "sheetRow": number,
            }
        )

    return approved, declined


def main():
    parser = argparse.ArgumentParser(
        description="Reviewed spreadsheet -> the rows approved for the website."
    )
    parser.add_argument("workbook", help="the reviewed .xlsx")
    parser.add_argument("out", help="where to write the approved rows as JSON")
    parser.add_argument(
        "--images",
        help="the extractor's images/ directory, if the sheet has moved away from it",
    )
    args = parser.parse_args()

    workbook_path = Path(args.workbook)
    if not workbook_path.exists():
        sys.exit(f"no such file: {workbook_path}")

    images = Path(args.images) if args.images else workbook_path.parent / "images"

    book = load_workbook(workbook_path, data_only=True)

    approved, declined = [], []
    for sheet in book.worksheets:
        if sheet.title in NOT_A_BRAND or sheet.sheet_state != "visible":
            continue
        chosen, refused = read_sheet(sheet)
        approved.extend(chosen)
        declined.extend(refused)

    missing_images = [
        row for row in approved if row["image"] and not (images / row["image"]).exists()
    ]

    Path(args.out).write_text(
        json.dumps(
            {
                "workbook": str(workbook_path.resolve()),
                "imagesDir": str(images.resolve()),
                "approved": approved,
                "declined": declined,
            },
            indent=1,
            ensure_ascii=False,
        )
    )

    by_brand = {}
    for row in approved:
        by_brand[row["brand"]] = by_brand.get(row["brand"], 0) + 1

    print(f"{len(approved)} row(s) approved")
    for brand, count in sorted(by_brand.items()):
        print(f"  {brand}: {count}")

    if declined:
        print(f"\n{len(declined)} highlighted row(s) NOT importable:")
        for item in declined:
            print(f"  {item['sheet']} row {item['row']}: {item['reason']}")

    if missing_images:
        print(f"\n{len(missing_images)} approved row(s) name an image not in {images}:")
        for row in missing_images[:10]:
            print(f"  {row['code']}: {row['image']}")
        print("  they will import without a photograph")

    if not approved:
        print(
            "\nNothing was highlighted, and no Sell? column was marked. "
            "Highlight the rows to sell, or put an x in the Sell? column."
        )

    print(f"\n-> {args.out}")


if __name__ == "__main__":
    main()
