"""Rebuild the review spreadsheet from a finished extraction run.

The extraction is the expensive half; the workbook is a view of it. When
the layout has to change — a column, a dropdown, where the freeze sits —
there is no reason to read the PDFs again:

    .venv/bin/python research/rebuild-sheet-workbook.py \
        research/data/sheets/2026-11-18-clean \
        --categories research/data/categories.json \
        --per-brand

It reads `catalogue-extract.json` and the `thumbs/` beside it, writes
`catalogue-extract.xlsx` through the same `write_workbook` the extractor
uses, and then reopens the file to count the pictures that actually
landed on each sheet. **Writing is not proof.** openpyxl will happily
save a workbook whose thumbnails were never attached, so the count is
read back from the saved file rather than from the objects in memory.

With `--per-brand` it also writes one workbook per brand beside it, for
sending to a supplier who should only see their own products.
"""

import argparse
import importlib.util
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

_src = Path(__file__).with_name("extract-catalogue-sheet.py")
_spec = importlib.util.spec_from_file_location("extract_catalogue_sheet", _src)
_extract = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_extract)

write_workbook = _extract.write_workbook


def pictures_per_sheet(path):
    """Count drawn pictures per sheet name, read back out of the saved file.

    Each worksheet points at one drawing part through its rels; the
    drawing holds one anchor per picture. Counting anchors there counts
    what Excel will try to paint.
    """
    counts = {}
    with zipfile.ZipFile(path) as book:
        workbook = book.read("xl/workbook.xml").decode()
        rels = book.read("xl/_rels/workbook.xml.rels").decode()
        target_of = dict(
            re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels)
        ) or {
            rid: target
            for target, rid in re.findall(
                r'Target="([^"]+)"\s+Id="([^"]+)"', rels
            )
        }
        for name, rid in re.findall(
            r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', workbook
        ):
            sheet_part = "xl/" + target_of[rid].lstrip("/").removeprefix("xl/")
            rel_part = (
                sheet_part.rsplit("/", 1)[0]
                + "/_rels/"
                + sheet_part.rsplit("/", 1)[1]
                + ".rels"
            )
            if rel_part not in book.namelist():
                counts[name] = 0
                continue
            drawings = re.findall(
                r'Target="([^"]*drawings/drawing[^"]*)"',
                book.read(rel_part).decode(),
            )
            total = 0
            for drawing in drawings:
                part = "xl/" + drawing.lstrip("/").removeprefix("xl/")
                part = part.replace("../", "")
                if part in book.namelist():
                    total += book.read(part).decode().count("<xdr:pic>") or book.read(
                        part
                    ).decode().count("<pic>")
            counts[name] = total
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", help="a directory holding catalogue-extract.json")
    parser.add_argument("--categories", help="categories.json for the dropdown")
    parser.add_argument(
        "--per-brand",
        action="store_true",
        help="also write one workbook per brand beside the combined one",
    )
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    manifest = json.loads((run_dir / "catalogue-extract.json").read_text())

    categories = []
    if args.categories:
        loaded = json.loads(Path(args.categories).read_text())
        if isinstance(loaded, dict):
            categories = list(loaded.get("categories", []))
        else:
            categories = list(loaded)

    by_brand = defaultdict(list)
    for row in manifest["rows"]:
        by_brand[row["brand"]].append(row)

    sources = manifest.get("sources", [])

    combined = run_dir / "catalogue-extract.xlsx"
    write_workbook(combined, dict(by_brand), run_dir, categories, sources)
    counts = pictures_per_sheet(combined)
    print(f"{combined.name}  ({combined.stat().st_size / 1e6:.1f} MB)")
    for brand, rows in sorted(by_brand.items()):
        with_thumb = sum(1 for r in rows if (run_dir / "thumbs" / r["thumb"]).exists())
        drawn = counts.get(brand, 0)
        mark = "ok " if drawn == with_thumb else "!! "
        print(f"  {mark}{brand}: {drawn} pictures drawn / {with_thumb} thumbnails")

    if args.per_brand:
        for brand, rows in sorted(by_brand.items()):
            safe = re.sub(r"[^A-Za-z0-9]+", "-", brand).strip("-").lower()
            path = run_dir / f"catalogue-{safe}.xlsx"
            write_workbook(path, {brand: rows}, run_dir, categories, sources)
            drawn = pictures_per_sheet(path).get(brand, 0)
            print(f"{path.name}  ({path.stat().st_size / 1e6:.1f} MB)  {drawn} pictures")


if __name__ == "__main__":
    main()
