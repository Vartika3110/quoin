"""Load the catalogue from the Quoin data document.

Reads the .docx table directly — no manual conversion to CSV, so a
re-export from the source can be re-imported without hand steps. The
document's hyperlinks live in the relationship part rather than the cell
text, so they are resolved back to real URLs here.

Idempotent: rows are matched on SKU and updated in place, so running it
twice does not duplicate the catalogue.
"""
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from catalog.models import (
    Brand,
    Category,
    Fulfilment,
    GstRate,
    PriceTier,
    PricingUnit,
    Product,
    ProductVariant,
)

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

UNCATEGORISED = "Uncategorised"

#: GST slabs by category. Cement and sanitaryware sit at 28%; most other
#: building materials at 18%. Wrong tax is an invoicing problem, so these
#: are explicit rather than defaulted silently.
GST_BY_CATEGORY = {
    "cement & steel": GstRate.TWENTY_EIGHT,
    "bathware & plumbing": GstRate.EIGHTEEN,
    "electricals & lighting": GstRate.EIGHTEEN,
    "tiling & adhesives": GstRate.EIGHTEEN,
    "paints & finishes": GstRate.EIGHTEEN,
    "plywood & laminates": GstRate.EIGHTEEN,
    "hardware & locks": GstRate.EIGHTEEN,
    "waterproofing": GstRate.EIGHTEEN,
}

#: Pricing unit inferred from the product name. Order matters — the first
#: match wins, so the more specific patterns come first.
UNIT_PATTERNS = [
    (re.compile(r"\b(\d+\s*)?(kg|kgs)\b", re.I), PricingUnit.KG),
    (re.compile(r"\b(\d+\s*)?(ltr|litre|liter|l)\b", re.I), PricingUnit.LITRE),
    (re.compile(r"\bbag\b", re.I), PricingUnit.BAG),
    (re.compile(r"\bsq\.?\s?ft|square\s?feet\b", re.I), PricingUnit.SQFT),
    (re.compile(r"\b(running\s?ft|r\.?ft|per\s?metre|meter|metres)\b", re.I), PricingUnit.RUNNING_FT),
    (re.compile(r"\b(visit|consultation|inspection|service)\b", re.I), PricingUnit.VISIT),
]


def cell_text(tc):
    return "".join(t.text or "" for t in tc.iter(W + "t")).strip()


def cell_link(tc, rels):
    for h in tc.iter(W + "hyperlink"):
        rid = h.get(R + "id")
        if rid in rels:
            return rels[rid]
    return ""


def read_table(path):
    """Yields dicts keyed by the document's own header row."""
    z = zipfile.ZipFile(path)
    rels = {
        rel.get("Id"): rel.get("Target")
        for rel in ET.fromstring(z.read("word/_rels/document.xml.rels"))
    }
    root = ET.fromstring(z.read("word/document.xml"))
    try:
        tbl = next(root.iter(W + "tbl"))
    except StopIteration:
        raise CommandError("No table found in the document.")

    rows = []
    for tr in tbl.findall(W + "tr"):
        cells = tr.findall(W + "tc")
        rows.append([(cell_text(tc), cell_link(tc, rels)) for tc in cells])

    header = [t for t, _ in rows[0]]
    for row in rows[1:]:
        yield {header[i]: row[i] for i in range(min(len(header), len(row)))}


def to_paise(raw):
    """'Rs 8,039' -> 803900. Integer paise; never float rupees."""
    digits = re.sub(r"[^\d.]", "", raw or "")
    if not digits:
        return None
    return int(round(float(digits) * 100))


def guess_unit(name):
    for pattern, unit in UNIT_PATTERNS:
        if pattern.search(name or ""):
            return unit
    return PricingUnit.PIECE


def guess_fulfilment(unit):
    """Conservative by design.

    Nothing is marked `instant` on import: that claims a dark store holds
    the item, which is an inventory fact this document does not carry.
    Merchandising promotes products to instant once stock is real.
    """
    if unit == PricingUnit.VISIT:
        return Fulfilment.BOOKABLE
    if unit == PricingUnit.SQFT:
        return Fulfilment.MADE_TO_ORDER
    return Fulfilment.SCHEDULED


class Command(BaseCommand):
    help = "Import the Quoin catalogue from the data document (.docx)."

    def add_arguments(self, parser):
        parser.add_argument("path", type=str, help="Path to the .docx data file")
        parser.add_argument("--dry-run", action="store_true", help="Parse and report without writing")

    @transaction.atomic
    def handle(self, *args, **opts):
        path = Path(opts["path"]).expanduser()
        if not path.exists():
            raise CommandError(f"File not found: {path}")

        created = updated = skipped = 0
        no_category = no_price = 0
        brands, categories = {}, {}

        def get_brand(name):
            name = (name or "").strip()
            if not name:
                return None
            if name not in brands:
                brands[name], _ = Brand.objects.get_or_create(name=name)
            return brands[name]

        def get_category(name):
            name = (name or "").strip() or UNCATEGORISED
            if name not in categories:
                categories[name], _ = Category.objects.get_or_create(name=name)
            return categories[name]

        for row in read_table(path):
            sku = (row.get("SKU") or ("", ""))[0].strip()
            name = (row.get("Name") or ("", ""))[0].strip()
            if not sku or not name:
                skipped += 1
                continue

            price = to_paise((row.get("Price (INR)") or ("", ""))[0])
            if price is None:
                no_price += 1
                skipped += 1
                continue

            raw_category = (row.get("Category") or ("", ""))[0].strip()
            if not raw_category:
                no_category += 1

            unit = guess_unit(name)
            category = get_category(raw_category)
            gst = GST_BY_CATEGORY.get(raw_category.lower(), GstRate.EIGHTEEN)

            if opts["dry_run"]:
                created += 1
                continue

            brand = get_brand((row.get("Brand") or ("", ""))[0])
            product, was_created = Product.objects.update_or_create(
                sku=sku,
                defaults={
                    "name": name,
                    "brand": brand,
                    "category": category,
                    "pricing_unit": unit,
                    "fulfilment": guess_fulfilment(unit),
                    "gst_rate": gst,
                    # Quoin's own image stays empty; the storefront draws a
                    # swatch rather than borrowing someone else's photograph.
                    "image": "",
                    "source_name": (row.get("Source") or ("", ""))[0].strip(),
                    "source_url": (row.get("Product Link") or ("", ""))[1],
                    "source_image_url": (row.get("Image Link") or ("", ""))[1],
                    "source_availability": (row.get("Availability") or ("", ""))[0].strip(),
                    "source_price_paise": price,
                },
            )

            # One default variant per product: the document carries a single
            # price per row. Real variants get added in the admin.
            variant, _ = ProductVariant.objects.update_or_create(
                sku=f"{sku}-STD",
                defaults={
                    "product": product,
                    "label": "Standard",
                    "mrp_paise": price,
                    "price_paise": price,
                    "min_qty": 1,
                    "step_qty": 1,
                    "is_default": True,
                },
            )

            tiers = (row.get("Vol. Tiers") or ("0", ""))[0].strip()
            if tiers.isdigit() and int(tiers) > 0:
                PriceTier.objects.get_or_create(
                    variant=variant, min_qty=1, defaults={"price_paise": price}
                )

            created += was_created
            updated += (not was_created)

        style = self.style
        self.stdout.write(style.SUCCESS(f"created {created}, updated {updated}, skipped {skipped}"))
        self.stdout.write(f"  brands: {len(brands)}   categories: {len(categories)}")
        if no_category:
            self.stdout.write(style.WARNING(
                f"  {no_category} rows had no category and were filed under '{UNCATEGORISED}'"))
        if no_price:
            self.stdout.write(style.WARNING(f"  {no_price} rows had an unreadable price"))
        if opts["dry_run"]:
            self.stdout.write(style.WARNING("dry run — rolled back, nothing written"))
            transaction.set_rollback(True)
