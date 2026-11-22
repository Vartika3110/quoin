"""The Handypanda paint scrape, as four sheets a person can read.

    .venv/bin/python research/build-handypanda-paints-sheet.py \
        research/data/handypanda-paints

**The 61,635 SKUs are not 61,635 prices.** Within a product and a pack
size the shade does not move the price: Royale Matt 1L is the same
money in all 2,200 colours. So the sheet leads with `Pack prices`, one
row per thing you can actually buy, and keeps the shade-level rows
behind it for completeness rather than putting them in front of
somebody who has to compare a price list.

`Shade card` paints each cell its own colour, because a hex code in a
column is not a colour anybody can see.

Every price here is Handypanda's, GST-inclusive, read from their site
on the date in the manifest. None of it is a Quoin price.
"""

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.request import Request, urlopen

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
)
HEADER_FILL = PatternFill("solid", fgColor="1F2A37")
HEADER_FONT = Font(bold=True, color="FFFFFF")


def head(sheet, columns):
    for i, (label, width) in enumerate(columns, start=1):
        cell = sheet.cell(row=1, column=i, value=label)
        cell.fill, cell.font = HEADER_FILL, HEADER_FONT
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.column_dimensions[get_column_letter(i)].width = width
    sheet.row_dimensions[1].height = 28
    sheet.freeze_panes = "A2"


def rupees(cell, paise):
    if paise is None:
        return
    cell.value = paise / 100
    cell.number_format = "#,##0.00"


def download_images(products, out_dir):
    """One picture per product, fetched once and kept."""
    from PIL import Image

    images = out_dir / "images"
    thumbs = out_dir / "thumbs"
    images.mkdir(exist_ok=True)
    thumbs.mkdir(exist_ok=True)

    got = {}
    for product in products:
        url = product.get("image")
        if not url:
            continue
        stem = re.sub(r"[^A-Za-z0-9]+", "-", product["name"]).strip("-").lower()
        full = images / f"{stem}.jpg"
        thumb = thumbs / f"{stem}.jpg"
        if not full.exists():
            try:
                req = Request(url, headers={"User-Agent": UA})
                with urlopen(req, timeout=45) as r:
                    full.write_bytes(r.read())
            except Exception as e:
                print(f"  no image for {product['name']}: {type(e).__name__}")
                continue
        if not thumb.exists():
            try:
                picture = Image.open(full).convert("RGB")
                picture.thumbnail((96, 96), Image.LANCZOS)
                picture.save(thumb, "JPEG", quality=88)
            except Exception as e:
                print(f"  bad image for {product['name']}: {type(e).__name__}")
                continue
        got[product["name"]] = thumb
    return got


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir")
    args = parser.parse_args()

    run = Path(args.run_dir)
    manifest = json.loads((run / "handypanda-paints.json").read_text())
    products = manifest["products"]
    variants = manifest["variants"]

    print(f"{len(products)} products, {len(variants)} skus, "
          f"{len(manifest['shadeCard'])} shades")
    thumbs = download_images(products, run)
    print(f"{len(thumbs)} product pictures")

    book = Workbook()

    # --- what this is -----------------------------------------------
    about = book.active
    about.title = "What this is"
    about.column_dimensions["A"].width = 104
    lines = [
        ("Handypanda's paint range", True),
        (f"Read from {manifest['site']} on {manifest['scrapedAt'][:10]}.", False),
        ("", False),
        (f"{len(products)} paint products, {len(variants):,} SKUs, "
         f"{len(manifest['shadeCard']):,} shades.", False),
        ("", False),
        ("Pack prices is the sheet to read. Within one product and one pack "
         "size the shade does not change the price — Royale Matt 1L costs "
         "the same in all 2,200 colours — so every price Handypanda charges "
         "fits on that one sheet.", False),
        ("All SKUs has the shade-level rows behind it, one per colour and "
         "pack, in case a particular shade ever needs checking.", False),
        ("Shade card is Asian Paints' own colour list as Handypanda "
         "publishes it, with each cell filled in its own colour.", False),
        ("", False),
        ("These are a competitor's prices, GST-inclusive, on the date above. "
         "Nothing here is a Quoin price and nothing here should be imported "
         "as one.", True),
    ]
    for text, bold in lines:
        cell = about.cell(row=about.max_row + 1, column=1, value=text)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        if bold:
            cell.font = Font(bold=True, size=12)

    # --- one row per product ----------------------------------------
    sheet = book.create_sheet("Paint products")
    head(sheet, [("Picture", 14), ("Brand", 22), ("Product", 34),
                 ("Category", 20), ("Pack sizes", 26), ("Shades", 9),
                 ("SKUs", 9), ("Cheapest (₹)", 14), ("Dearest (₹)", 14),
                 ("Matched on", 12), ("Page", 56)])
    for row, product in enumerate(
        sorted(products, key=lambda p: (p["brand"] or "", p["name"] or "")), start=2
    ):
        sheet.row_dimensions[row].height = 74
        sheet.cell(row=row, column=2, value=product["brand"])
        sheet.cell(row=row, column=3, value=product["name"])
        sheet.cell(row=row, column=4, value=product["category"])
        sheet.cell(row=row, column=5, value=", ".join(product["packSizes"]))
        sheet.cell(row=row, column=6, value=product["shadeCount"])
        sheet.cell(row=row, column=7, value=product["skuCount"])
        rupees(sheet.cell(row=row, column=8), product["lowestPaise"])
        rupees(sheet.cell(row=row, column=9), product["highestPaise"])
        sheet.cell(row=row, column=10, value=product["matchedOn"])
        sheet.cell(row=row, column=11, value=product["url"])
        thumb = thumbs.get(product["name"])
        if thumb:
            picture = XLImage(str(thumb))
            picture.anchor = f"A{row}"
            sheet.add_image(picture)

    # --- product x pack: the real price list -------------------------
    packs = defaultdict(lambda: {"prices": set(), "skus": 0, "shades": set(),
                                 "stock": set(), "url": None})
    for v in variants:
        key = (v["brand"], v["productName"], v["packSize"] or "—")
        entry = packs[key]
        entry["prices"].add(v["sellingPricePaise"])
        entry["skus"] += 1
        if v["shade"]:
            entry["shades"].add(v["shade"])
        entry["stock"].add(bool(v["inStock"]))
        entry["url"] = v["url"]

    sheet = book.create_sheet("Pack prices")
    head(sheet, [("Brand", 22), ("Product", 34), ("Pack", 16), ("Price (₹)", 13),
                 ("Also sold at (₹)", 18), ("Shades", 9), ("SKUs", 9),
                 ("In stock", 10), ("Page", 56)])
    for row, (key, entry) in enumerate(sorted(
        packs.items(), key=lambda kv: (kv[0][0] or "", kv[0][1] or "",
                                       min(kv[1]["prices"]))), start=2):
        brand, name, pack = key
        prices = sorted(entry["prices"])
        sheet.cell(row=row, column=1, value=brand)
        sheet.cell(row=row, column=2, value=name)
        sheet.cell(row=row, column=3, value=pack)
        rupees(sheet.cell(row=row, column=4), prices[0])
        if len(prices) > 1:
            sheet.cell(row=row, column=5,
                       value=", ".join(f"{p/100:,.0f}" for p in prices[1:]))
        sheet.cell(row=row, column=6, value=len(entry["shades"]) or None)
        sheet.cell(row=row, column=7, value=entry["skus"])
        sheet.cell(row=row, column=8,
                   value="yes" if True in entry["stock"] else "no")
        sheet.cell(row=row, column=9, value=entry["url"])

    # --- every SKU ----------------------------------------------------
    sheet = book.create_sheet("All SKUs")
    head(sheet, [("Brand", 20), ("Product", 30), ("Pack", 14), ("Shade", 24),
                 ("Shade code", 12), ("Price (₹)", 12), ("SKU", 20),
                 ("In stock", 10), ("Variant", 34)])
    for row, v in enumerate(sorted(
        variants, key=lambda r: (r["brand"] or "", r["productName"] or "",
                                 r["packSize"] or "", r["shade"] or "")), start=2):
        sheet.cell(row=row, column=1, value=v["brand"])
        sheet.cell(row=row, column=2, value=v["productName"])
        sheet.cell(row=row, column=3, value=v["packSize"])
        sheet.cell(row=row, column=4, value=v["shade"])
        sheet.cell(row=row, column=5, value=v["shadeCode"])
        rupees(sheet.cell(row=row, column=6), v["sellingPricePaise"])
        sheet.cell(row=row, column=7, value=v["skuId"])
        sheet.cell(row=row, column=8, value="yes" if v["inStock"] else "no")
        sheet.cell(row=row, column=9, value=v["variant"])

    # --- the colour card ----------------------------------------------
    sheet = book.create_sheet("Shade card")
    head(sheet, [("Colour", 12), ("Code", 10), ("Shade", 28), ("Family", 16),
                 ("Hex", 12), ("Warmth", 12), ("Tonality", 12), ("Rooms", 40)])
    for row, shade in enumerate(manifest["shadeCard"], start=2):
        hex_code = (shade.get("shadeHexCode") or "").lstrip("#").upper()
        if re.fullmatch(r"[0-9A-F]{6}", hex_code):
            sheet.cell(row=row, column=1).fill = PatternFill(
                "solid", fgColor=hex_code
            )
        sheet.cell(row=row, column=2, value=shade.get("code"))
        sheet.cell(row=row, column=3, value=shade.get("label"))
        sheet.cell(row=row, column=4, value=shade.get("shadeFamily"))
        sheet.cell(row=row, column=5, value=shade.get("shadeHexCode"))
        sheet.cell(row=row, column=6, value=shade.get("colorTemperature"))
        sheet.cell(row=row, column=7, value=shade.get("tonality"))
        sheet.cell(row=row, column=8, value=", ".join(shade.get("rooms") or []))

    path = run / "handypanda-paints.xlsx"
    book.save(path)
    print(f"{path}  ({path.stat().st_size / 1e6:.1f} MB)")
    for name in book.sheetnames:
        print(f"  {name}: {book[name].max_row - 1} rows")


if __name__ == "__main__":
    main()
