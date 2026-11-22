#!/usr/bin/env python3
"""Compares every way of getting a product photograph out of a catalogue PDF.

Run on a handful of products before trusting any of them in bulk:

    .venv/bin/python research/test-image-extraction.py \
        "/Users/gg/Desktop/Catalogue A - Rest of India LR.pdf" --count 10

For each product it writes one file per extraction method, measures all of
them, and renders a side-by-side sheet so the numbers can be checked
against what the eye says. Nothing here resizes anything up: a method that
cannot produce more pixels than the PDF holds is reported as such rather
than interpolated to look better.

The methods, in the order the report lists them:

  embedded-raw      PyMuPDF `doc.extract_image(xref)` — the compressed
                    bytes exactly as the PDF stores them, no decode, no
                    re-encode. `pdfimages -all` produces the same stream;
                    this is that, without needing poppler installed.
  embedded-pikepdf  the same XObject read through pikepdf, as an
                    independent check that the bytes above are the whole
                    stream and not PyMuPDF's idea of it.
  embedded-onwhite  those bytes decoded and composited over white through
                    their own /SMask. Needed because these catalogues
                    silhouette products on transparency, so the raw
                    stream alone decodes to a product on black.
  render-native     the page region rasterised at whichever DPI preserves
                    the native pixels of the images placed in it — not a
                    fixed constant. For a region with no raster at all
                    (pure vector artwork) there is no native size to
                    preserve, so it renders at VECTOR_DPI.
  render-200        the same region at the fixed 200 DPI that
                    research/extract-catalogue-sheet.py uses today, kept
                    only as the baseline the others are judged against.

Free and local throughout: PyMuPDF, pikepdf, pdfplumber, Pillow, OpenCV,
NumPy. No network call, no API key.
"""

import argparse
import hashlib
import importlib.util
import io
import json
import re
import sys
from pathlib import Path

import cv2
import fitz
import numpy as np
import pdfplumber
import pikepdf
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent

#: Where a region holds no raster: vector has no native resolution, so
#: the only limit is what is worth storing. 600 is print quality.
VECTOR_DPI = 600

#: Ceiling on the adaptive render, so a PDF that claims an absurd
#: effective DPI cannot ask for a 20 000 px crop.
MAX_RENDER_DPI = 900

#: What the storefront needs on the long side for a product card at 2×
#: device pixel ratio. Reported against, not enforced.
TARGET_PX = 600


def load_extractor():
    """The existing extractor, imported for its caption and box logic.

    Reusing it rather than reimplementing it: whether a box is a product
    photograph and which words caption it are the two judgements that
    took the longest to get right, and a second copy of them would drift.
    """
    path = HERE / "extract-catalogue-sheet.py"
    spec = importlib.util.spec_from_file_location("catalogue_sheet", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --- inspection -----------------------------------------------------------


def inventory(pdf_path, pages):
    """Every image XObject in the given pages, with its own properties.

    This is `pdfimages -list` by another route: pikepdf reads the image
    dictionaries directly, and PyMuPDF supplies where each one is drawn,
    which is what turns a pixel size into an effective DPI.
    """
    rows = []
    doc = fitz.open(pdf_path)
    with pikepdf.open(pdf_path) as pdf:
        for page_no in pages:
            page = doc[page_no - 1]
            placed = {
                info["xref"]: info
                for info in page.get_image_info(xrefs=True)
                if info.get("xref")
            }
            for xref, smask, width, height, bpc, cs, _alt, name, filt, *_ in (
                page.get_images(full=True)
            ):
                info = placed.get(xref, {})
                bbox = info.get("bbox")
                drawn_w = (bbox[2] - bbox[0]) / 72 if bbox else None
                drawn_h = (bbox[3] - bbox[1]) / 72 if bbox else None
                raw = pike_image(pdf, page_no, name)
                rows.append(
                    {
                        "page": page_no,
                        "name": name,
                        "xref": xref,
                        "width": width,
                        "height": height,
                        "bpc": bpc,
                        "colorspace": cs or "-",
                        "filter": filt or "-",
                        "has_smask": bool(smask),
                        "stream_bytes": len(raw.read_raw_bytes()) if raw else None,
                        "drawn_in": (
                            f"{drawn_w * 72:.0f}x{drawn_h * 72:.0f}pt"
                            if bbox
                            else "not placed"
                        ),
                        "dpi_x": round(width / drawn_w) if drawn_w else None,
                        "dpi_y": round(height / drawn_h) if drawn_h else None,
                    }
                )
    doc.close()
    return rows


# --- measuring ------------------------------------------------------------


def artwork_box(img):
    """The bounding box of the product inside its padding.

    A catalogue raster is mostly empty space: the artwork is centred in a
    box sized for the page layout. Measuring the file gives the layout's
    dimensions, not the product's, which is how a 58x307 faucet gets
    described as 307 px tall when the faucet is 58 px wide.
    """
    if img.mode == "RGBA":
        alpha = np.array(img.split()[-1])
        mask = alpha > 8
    else:
        grey = np.array(img.convert("L"))
        mask = grey < 246
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def sharpness(img, at_width=None):
    """Variance of the Laplacian, optionally at a fixed width first.

    Raw Laplacian variance rises with pixel count, so comparing a 200 DPI
    render against a 100 DPI source rewards the render for having been
    interpolated. Passing `at_width` resizes both to the same width
    before measuring, which asks the question that matters: once the two
    are the same size, does either carry more detail than the other?
    """
    grey = img.convert("L")
    if at_width and grey.width != at_width and grey.width > 1:
        height = max(1, round(grey.height * at_width / grey.width))
        grey = grey.resize((at_width, height), Image.LANCZOS)
    array = np.array(grey, dtype=np.uint8)
    if array.size < 16:
        return 0.0
    return float(cv2.Laplacian(array, cv2.CV_64F).var())


def measure(img, native_long=None, dpi_ratio=1.0):
    """Dimensions, artwork size and sharpness for one extraction result.

    `dpi_ratio` is the DPI this result was produced at over the DPI the
    source actually holds — 2.0 for a 200 DPI render of a 100 DPI image.
    Dividing the artwork size by it gives `genuine_long`: how many of
    those pixels came out of the PDF rather than out of an interpolator.
    That figure, not the file's dimensions, is what the methods are
    ranked on, because a file can be made any size at all and saying so
    is how "high resolution" stops meaning anything.
    """
    box = artwork_box(img)
    art_w = box[2] - box[0] if box else 0
    art_h = box[3] - box[1] if box else 0
    long_side = max(img.width, img.height)
    art_long = max(art_w, art_h)
    return {
        "px": f"{img.width}x{img.height}",
        "width": img.width,
        "height": img.height,
        "artwork_px": f"{art_w}x{art_h}",
        "artwork_long": art_long,
        "genuine_long": round(art_long / max(dpi_ratio, 1.0)),
        "interpolation": round(max(dpi_ratio, 1.0), 2),
        "sharpness": round(sharpness(img), 1),
        "sharpness_at_256": round(sharpness(img, at_width=256), 1),
        "upscale_vs_native": (
            round(long_side / native_long, 2) if native_long else None
        ),
    }


# --- the methods ----------------------------------------------------------


def to_fitz_box(page, box):
    """One pdfplumber box in PyMuPDF's coordinates.

    Both measure y downwards from the top, but from the top of a
    different rectangle: pdfplumber works in MediaBox coordinates and
    PyMuPDF in CropBox ones. The Hindware pages carry a CropBox inset
    28.35pt from the MediaBox, so without this shift every comparison
    between the two is off by 10mm — enough to credit a product's box to
    its neighbour's image.
    """
    origin = page.cropbox_position
    return {
        "x0": box["x0"] - origin.x,
        "top": box["top"] - origin.y,
        "x1": box["x1"] - origin.x,
        "bottom": box["bottom"] - origin.y,
    }


def overlapping_xrefs(page, box):
    """The image XObjects drawn inside one product box, largest first."""
    box = to_fitz_box(page, box)
    found = []
    for info in page.get_image_info(xrefs=True):
        x0, top, x1, bottom = info["bbox"]
        if x1 <= box["x0"] or x0 >= box["x1"]:
            continue
        if bottom <= box["top"] or top >= box["bottom"]:
            continue
        overlap = (min(x1, box["x1"]) - max(x0, box["x0"])) * (
            min(bottom, box["bottom"]) - max(top, box["top"])
        )
        found.append((overlap, info))
    found.sort(key=lambda pair: -pair[0])
    return [info for _, info in found]


def embedded_raw(doc, xref):
    """The stored bytes of one image, untouched. Poppler's `-all` output."""
    try:
        return doc.extract_image(xref)
    except Exception:
        return None


def xref_names(fitz_page):
    """PDF resource name per xref, e.g. 4211 -> "Im7".

    `get_image_info` does not carry the resource name and pikepdf indexes
    its images by it, so the two have to be joined through
    `get_images(full=True)`, which reports both.
    """
    return {row[0]: row[7] for row in fitz_page.get_images(full=True)}


def xref_smasks(fitz_page):
    """Soft-mask xref per image xref, 0 where an image carries none."""
    return {row[0]: row[1] for row in fitz_page.get_images(full=True)}


def pike_image(pdf, page_no, name):
    """One image XObject out of pikepdf, by the name PyMuPDF reports.

    pikepdf keys its image dictionary by PDF name — "/Im7" — while
    PyMuPDF reports the bare "Im7", so both spellings are tried.
    """
    if not name:
        return None
    images = pdf.pages[page_no - 1].images
    return images.get(name) or images.get(f"/{name}")


def embedded_pikepdf(pdf, page_no, name):
    """The same stream read independently, to check the bytes agree."""
    try:
        obj = pike_image(pdf, page_no, name)
        return obj.read_raw_bytes() if obj else None
    except Exception:
        return None


def decode(doc, xref, mode="RGB"):
    """One image XObject decoded to a PIL image, CMYK converted to RGB."""
    pix = fitz.Pixmap(doc, xref)
    if pix.colorspace and pix.colorspace.n == 4:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert(mode)


def composite_on_white(doc, xref, smask_xref=0):
    """One embedded image laid over white through its own soft mask.

    `fitz.Pixmap(doc, xref)` returns the colour stream alone: in these
    catalogues the transparency is a *separate* /SMask XObject, so
    decoding the colour stream by itself yields a product sitting on
    whatever the unused background pixels happen to hold — usually
    black. The mask has to be fetched by its own xref and applied, and it
    is allowed to be a different size from the image it masks, so it is
    resized to fit before use.

    Without this step "extract the embedded image" and "extract the
    product photograph" are not the same operation, which is the whole
    question this test was built to settle.
    """
    try:
        base = decode(doc, xref)
    except Exception:
        return None
    if not smask_xref:
        return base
    try:
        mask = decode(doc, smask_xref, mode="L")
        if mask.size != base.size:
            mask = mask.resize(base.size, Image.LANCZOS)
        canvas = Image.new("RGB", base.size, "white")
        canvas.paste(base, mask=mask)
        return canvas
    except Exception:
        return base


def native_dpi_for(page, box):
    """The DPI range of the images drawn in one region: (render_at, holds).

    `render_at` is the highest effective DPI in the box — render below it
    and detail the PDF genuinely holds is thrown away, which is the one
    irreversible mistake available here.

    `holds` is the lowest. A box frequently contains more than one image
    at different resolutions: a 600 DPI logo over a 100 DPI photograph.
    Rendering at 600 does not make the photograph sharper, so the honest
    figure to credit the result with is the weakest source in the box,
    not the strongest. Reporting `render_at` as though the whole region
    carried it is exactly the inflation this test exists to catch.
    """
    best, worst = 0.0, None
    for info in overlapping_xrefs(page, box):
        x0, top, x1, bottom = info["bbox"]
        for extent_pt, pixels in (
            (x1 - x0, info["width"]),
            (bottom - top, info["height"]),
        ):
            inches = extent_pt / 72
            if inches <= 0:
                continue
            dpi = pixels / inches
            best = max(best, dpi)
            worst = dpi if worst is None else min(worst, dpi)
    return best, (worst or 0.0)


def render(plumber_page, box, dpi, extractor):
    """A page region rasterised at a given DPI, composited onto white."""
    top, bottom = extractor.trim_to_artwork(box, plumber_page.extract_words())
    crop = plumber_page.crop((box["x0"], top, box["x1"], bottom))
    img = crop.to_image(resolution=dpi).original
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        canvas = Image.new("RGB", img.size, "white")
        canvas.paste(img, mask=img.split()[-1])
        return canvas
    return img.convert("RGB")


# --- the sheet ------------------------------------------------------------


def comparison_sheet(entries, title, path):
    """One PNG per product: every method at its true relative size.

    Drawn to scale deliberately. A table of dimensions can be read past;
    a 130 px artwork sitting next to a 600 px render of the same product
    cannot.
    """
    pad, label_h, top_h = 16, 34, 30
    tall = max((img.height for _, img in entries), default=1)
    tall = min(tall, 520)
    scaled = []
    for label, img in entries:
        factor = min(1.0, tall / img.height) if img.height else 1.0
        size = (max(1, round(img.width * factor)), max(1, round(img.height * factor)))
        scaled.append((label, img.resize(size, Image.LANCZOS), img))

    width = pad + sum(img.width + pad for _, img, _ in scaled)
    height = top_h + tall + label_h + pad
    sheet = Image.new("RGB", (max(width, 420), height), "white")
    draw = ImageDraw.Draw(sheet)
    draw.text((pad, 8), title, fill="black")

    x = pad
    for label, shown, original in scaled:
        y = top_h + (tall - shown.height) // 2
        sheet.paste(shown, (x, y))
        draw.rectangle(
            [x - 1, y - 1, x + shown.width, y + shown.height], outline="#d0d0d0"
        )
        draw.text((x, top_h + tall + 6), label, fill="black")
        draw.text(
            (x, top_h + tall + 19),
            f"{original.width}x{original.height}",
            fill="#555555",
        )
        x += shown.width + pad
    sheet.save(path, "PNG")


# --- one run --------------------------------------------------------------


#: A box bigger than this share of its page is a layout, not a product.
#: The merge step joins boxes 3pt apart, which on a dense grid page walks
#: the whole spread into one box; such a crop holds a dozen products and
#: measuring its resolution says nothing about any of them.
MAX_PRODUCT_SHARE = 0.30


def pick_products(plumber, extractor, count, pages_spec):
    """Single products with a code printed under them, in page order.

    A code is the requirement: an image that cannot be tied to a SKU is
    not a product for this test, however good the photograph is. So is
    being one product — see MAX_PRODUCT_SHARE.
    """
    picked = []
    skipped_group = 0
    seen_codes = set()
    total = len(plumber.pages)
    wanted = (
        extractor.page_range(pages_spec, total) if pages_spec else range(1, total + 1)
    )
    for page_no in wanted:
        if len(picked) >= count:
            break
        page = plumber.pages[page_no - 1]
        page_area = max(page.width * page.height, 1)
        words = page.extract_words()
        pictures = extractor.product_pictures(page)
        for box in pictures:
            if len(picked) >= count:
                break
            share = (
                (box["x1"] - box["x0"]) * (box["bottom"] - box["top"]) / page_area
            )
            if share > MAX_PRODUCT_SHARE:
                skipped_group += 1
                continue
            caption = extractor.caption_words(words, box, pictures)
            code, price, name = extractor.parse_caption(caption)
            if not code:
                row = extractor.row_words(words, box, pictures)
                code, price, name = extractor.parse_caption(row)
            if not code or code in seen_codes:
                continue
            seen_codes.add(code)
            picked.append(
                {
                    "page": page_no,
                    "box": box,
                    "code": code,
                    "name": name or "",
                    "price_paise": price,
                }
            )
    if skipped_group:
        print(
            f"skipped {skipped_group} boxes larger than "
            f"{MAX_PRODUCT_SHARE:.0%} of their page: group shots, not "
            "single products"
        )
    return picked


def run(pdf_path, out_dir, count, pages_spec, vector_count):
    extractor = load_extractor()
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    pdf = pikepdf.open(pdf_path)
    report = []

    with pdfplumber.open(pdf_path) as plumber:
        products = pick_products(plumber, extractor, count, pages_spec)
        if vector_count:
            products += pick_vector_products(
                plumber, extractor, doc, vector_count, products
            )
        print(f"{len(products)} products selected from {Path(pdf_path).name}\n")

        for index, product in enumerate(products, start=1):
            page_no, box = product["page"], product["box"]
            fitz_page = doc[page_no - 1]
            plumber_page = plumber.pages[page_no - 1]
            stem = re.sub(r"[^A-Za-z0-9._-]", "_", product["code"])[:40]
            folder = out_dir / f"{index:02d}-{stem}"
            folder.mkdir(exist_ok=True)

            # How many product codes are printed inside the crop itself.
            # More than one means the box is a row or a grid that the
            # merge step joined, so whatever it renders is not this SKU's
            # photograph however many pixels it has. Worth catching here:
            # a crop of four taps filed under one code is the one failure
            # mode that looks fine in a spreadsheet.
            inside_codes = sorted(
                {
                    word["text"].strip(".,;:()")
                    for word in plumber_page.extract_words()
                    if box["x0"] <= (word["x0"] + word["x1"]) / 2 <= box["x1"]
                    and box["top"] <= (word["top"] + word["bottom"]) / 2 <= box["bottom"]
                    and extractor.is_code(word["text"])
                }
            )

            placements = overlapping_xrefs(fitz_page, box)
            entry = {
                "index": index,
                "code": product["code"],
                "name": product["name"],
                "price_paise": product["price_paise"],
                "pdf": Path(pdf_path).name,
                "page": page_no,
                "box_pt": [round(box[k], 1) for k in ("x0", "top", "x1", "bottom")],
                "raster_objects": len(placements),
                "codes_inside_box": inside_codes,
                "single_product": len(inside_codes) <= 1,
                "methods": {},
            }
            shots = []

            native_long = None
            if placements:
                best = placements[0]
                entry["xref"] = best["xref"]
                entry["native_px"] = f"{best['width']}x{best['height']}"
                native_long = max(best["width"], best["height"])
                x0, top, x1, bottom = best["bbox"]
                entry["effective_dpi"] = round(
                    best["width"] / max((x1 - x0) / 72, 1e-6)
                )

                raw = embedded_raw(doc, best["xref"])
                if raw:
                    name = f"embedded-raw.{raw['ext']}"
                    (folder / name).write_bytes(raw["image"])
                    img = Image.open(io.BytesIO(raw["image"]))
                    entry["methods"]["embedded-raw"] = {
                        "file": name,
                        "bytes": len(raw["image"]),
                        "format": raw["ext"],
                        "md5": hashlib.md5(raw["image"]).hexdigest(),
                        **measure(img, native_long),
                    }
                    shots.append(("embedded-raw", img.convert("RGB")))

                pike = embedded_pikepdf(
                    pdf, page_no, xref_names(fitz_page).get(best["xref"], "")
                )
                if pike:
                    (folder / "embedded-pikepdf.bin").write_bytes(pike)
                    entry["methods"]["embedded-pikepdf"] = {
                        "file": "embedded-pikepdf.bin",
                        "bytes": len(pike),
                        "md5": hashlib.md5(pike).hexdigest(),
                        "matches_pymupdf": (
                            hashlib.md5(pike).hexdigest()
                            == entry["methods"]
                            .get("embedded-raw", {})
                            .get("md5")
                        ),
                    }

                smask = xref_smasks(fitz_page).get(best["xref"], 0)
                entry["smask_xref"] = smask
                white = composite_on_white(doc, best["xref"], smask)
                if white:
                    white.save(folder / "embedded-onwhite.png")
                    on_white = measure(white, native_long)
                    entry["methods"]["embedded-onwhite"] = {
                        "file": "embedded-onwhite.png",
                        "smask_applied": bool(smask),
                        **on_white,
                    }
                    shots.append(("embedded-onwhite", white))

                    # The raw stream is the same pixel grid, but with the
                    # transparency still in a separate object, so nothing
                    # measuring opacity can find the artwork in it: every
                    # padding pixel reads as opaque and the file appears
                    # to be artwork edge to edge. It is credited with the
                    # masked figure instead of being allowed to win on
                    # padding it does not own.
                    raw_entry = entry["methods"].get("embedded-raw")
                    if raw_entry and raw_entry.get("px") == on_white["px"]:
                        raw_entry.update(
                            {
                                "artwork_px": on_white["artwork_px"],
                                "artwork_long": on_white["artwork_long"],
                                "genuine_long": on_white["genuine_long"],
                                "artwork_measured_via": "smask",
                            }
                        )

                # The controlled comparison: the same rectangle as the
                # embedded image, rendered at the same resolution the
                # embedded image holds. Only against this does "does
                # rendering lose detail?" have an answer — the whole-box
                # renders below cover a different region, so their
                # sharpness is not comparable with anything.
                object_dpi = round(
                    best["width"] / max((x1 - x0) / 72, 1e-6)
                )
                object_box = {
                    "x0": max(0.0, x0),
                    "top": max(0.0, top),
                    "x1": min(float(plumber_page.width), x1),
                    "bottom": min(float(plumber_page.height), bottom),
                }
                try:
                    same = render(plumber_page, object_box, object_dpi, extractor)
                    same.save(folder / "render-object-native.png")
                    entry["methods"]["render-object-native"] = {
                        "file": "render-object-native.png",
                        "dpi": object_dpi,
                        **measure(same, native_long),
                    }
                    shots.append((f"render-object @{object_dpi}dpi", same))
                except Exception as error:
                    entry["methods"]["render-object-native"] = {"error": str(error)}

            dpi, floor_dpi = native_dpi_for(fitz_page, box)
            entry["native_dpi_required"] = round(dpi) if dpi else None
            entry["weakest_source_dpi"] = round(floor_dpi) if floor_dpi else None
            use_dpi = min(round(dpi) or VECTOR_DPI, MAX_RENDER_DPI)
            entry["render_dpi_used"] = use_dpi
            entry["source"] = "raster" if placements else "vector"

            for label, at in (("render-native", use_dpi), ("render-200", 200)):
                try:
                    img = render(plumber_page, box, at, extractor)
                except Exception as error:  # a crop that falls off the page
                    entry["methods"][label] = {"error": str(error)}
                    continue
                name = f"{label}.png"
                img.save(folder / name)
                entry["methods"][label] = {
                    "file": name,
                    "dpi": at,
                    **measure(
                        img,
                        native_long,
                        dpi_ratio=at / floor_dpi if floor_dpi else 1.0,
                    ),
                }
                shots.append((f"{label} @{at}dpi", img))

            # Ranked on genuine pixels, so a render at twice the source's
            # DPI cannot win by having been interpolated. Where the crop
            # holds more than one product, the whole-box renders are not
            # candidates at all: their pixels are spread across products
            # this SKU does not own.
            object_only = {"embedded-raw", "embedded-onwhite", "render-object-native"}
            best_method = max(
                (
                    (data.get("genuine_long", 0), label)
                    for label, data in entry["methods"].items()
                    if "genuine_long" in data
                    and (entry["single_product"] or label in object_only)
                ),
                default=(0, None),
            )
            entry["most_genuine_pixels"] = best_method[1]
            entry["genuine_long"] = best_method[0]
            entry["meets_target_600px"] = best_method[0] >= TARGET_PX

            sheet = out_dir / f"{index:02d}-{stem}.png"
            comparison_sheet(
                shots,
                f"{product['code']} — {product['name'][:58]} "
                f"(p{page_no}, {entry['source']}, "
                f"native {entry.get('native_px', 'none')})",
                sheet,
            )
            entry["sheet"] = sheet.name
            report.append(entry)
            print(
                f"{index:2d}. {product['code']:<22} p{page_no:<4} "
                f"{entry['source']:<7} native {entry.get('native_px', '-'):>11} "
                f"@{entry.get('effective_dpi', '-')}dpi  "
                f"best {best_method[1]} ({best_method[0]}px genuine)"
                + ("" if entry["single_product"]
                   else f"  [crop holds {len(inside_codes)} codes]")
            )

    inv = inventory(pdf_path, sorted({e["page"] for e in report}))
    (out_dir / "inventory.json").write_text(json.dumps(inv, indent=2))
    (out_dir / "report.json").write_text(json.dumps(report, indent=2))
    write_markdown(out_dir / "REPORT.md", Path(pdf_path).name, report, inv)
    pdf.close()
    doc.close()
    return report


def pick_vector_products(plumber, extractor, doc, count, already):
    """Products on pages holding no raster at all, if the PDF has any.

    Worth testing separately because vector artwork has no native
    resolution to preserve, so the adaptive render has nothing to read
    and the ceiling is whatever is asked for.
    """
    picked = []
    seen_pages = {p["page"] for p in already}
    for page_no in range(1, len(plumber.pages) + 1):
        if len(picked) >= count:
            break
        if page_no in seen_pages:
            continue
        if doc[page_no - 1].get_images(full=True):
            continue
        page = plumber.pages[page_no - 1]
        words = page.extract_words()
        pictures = extractor.product_pictures(page)
        for box in pictures:
            if len(picked) >= count:
                break
            caption = extractor.caption_words(words, box, pictures)
            code, price, name = extractor.parse_caption(caption)
            if not code:
                continue
            picked.append(
                {
                    "page": page_no,
                    "box": box,
                    "code": code,
                    "name": name or "",
                    "price_paise": price,
                }
            )
    return picked


def write_markdown(path, pdf_name, report, inv):
    lines = [
        f"# Extraction test — {pdf_name}",
        "",
        f"{len(report)} products, every method run on each. "
        "All measurements are of the files in this directory.",
        "",
        "## What the PDF holds",
        "",
        f"- Image XObjects on the tested pages: **{len(inv)}**",
    ]
    dpis = [row["dpi_x"] for row in inv if row.get("dpi_x")]
    if dpis:
        dpis.sort()
        lines.append(
            f"- Effective DPI of those images: min {dpis[0]}, "
            f"median {dpis[len(dpis) // 2]}, max {dpis[-1]}"
        )
    masked = sum(1 for row in inv if row["has_smask"])
    checked = [
        data
        for entry in report
        for label, data in entry["methods"].items()
        if label == "embedded-pikepdf"
    ]
    agree = sum(1 for data in checked if data.get("matches_pymupdf"))
    lines += [
        f"- Carrying a soft mask (so the raw stream is a silhouette): "
        f"**{masked} of {len(inv)}**",
        f"- pikepdf and PyMuPDF returned byte-identical streams for "
        f"**{agree} of {len(checked)}** tested images",
        "",
        "## Per product",
        "",
        "`genuine px` is the artwork's long side divided by how far the "
        "method interpolated past the source's own resolution. It is the "
        "only column that cannot be inflated by rendering bigger.",
        "",
        "| # | Code | Page | Source | Native px | Eff. DPI | Method | Output px | "
        "Artwork px | Genuine px | Interp. | Sharp@256 |",
        "| - | - | - | - | - | - | - | - | - | - | - | - |",
    ]
    for entry in report:
        for label, data in entry["methods"].items():
            if "px" not in data:
                continue
            lines.append(
                f"| {entry['index']} | {entry['code']} | {entry['page']} | "
                f"{entry['source']} | {entry.get('native_px', '-')} | "
                f"{entry.get('effective_dpi', '-')} | {label} | {data['px']} | "
                f"{data['artwork_px']} | **{data.get('genuine_long', '-')}** | "
                f"{data.get('interpolation', '-')}x | "
                f"{data.get('sharpness_at_256', '-')} |"
            )
    met = sum(1 for e in report if e["meets_target_600px"])
    winners = {}
    for entry in report:
        winners[entry.get("most_genuine_pixels")] = (
            winners.get(entry.get("most_genuine_pixels"), 0) + 1
        )
    lines += [
        "",
        "## Verdict",
        "",
        f"- Products where any method reaches {TARGET_PX} px of genuine "
        f"artwork: **{met} of {len(report)}**",
        "- Method carrying the most genuine pixels, by product: "
        + ", ".join(f"{k} ×{v}" for k, v in sorted(winners.items(), key=str)),
        "- Crops holding more than one product code, so the photograph "
        "is not this SKU's alone: "
        + (
            ", ".join(
                f"#{e['index']} {e['code']} ({len(e['codes_inside_box'])} codes)"
                for e in report
                if not e["single_product"]
            )
            or "none"
        ),
        "- Product boxes holding more than one raster object (so the "
        "whole-box renders mix resolutions): "
        + (
            ", ".join(
                f"#{e['index']} {e['code']} ({e['raster_objects']} objects, "
                f"{e.get('weakest_source_dpi')}–{e.get('native_dpi_required')} dpi)"
                for e in report
                if e["raster_objects"] > 1
            )
            or "none"
        ),
        "",
        "Sharpness is Laplacian variance after resizing to a common 256 px "
        "width. It is comparable between `embedded-onwhite` and "
        "`render-object-native`, which cover the same rectangle; the "
        "whole-box renders cover a larger region, so their figure is "
        "descriptive only.",
        "",
    ]
    path.write_text("\n".join(lines))


def vector_demo(pdf_path, out_dir, page_no, region):
    """Whether rendering vector artwork higher actually buys detail.

    A raster at 100 DPI rendered at 200 gains pixels and no information:
    every one of them is interpolated. Vector artwork has no native
    resolution, so the same question has the opposite answer, and this
    measures it rather than asserting it — the same region at three DPIs,
    each resized to a common width before the sharpness measure, so the
    comparison is of detail and not of size.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    rows, shots = [], []
    with pdfplumber.open(pdf_path) as plumber:
        page = plumber.pages[page_no - 1]
        box = {
            "x0": region[0] * page.width,
            "top": region[1] * page.height,
            "x1": region[2] * page.width,
            "bottom": region[3] * page.height,
        }
        for dpi in (100, 200, 600):
            crop = page.crop((box["x0"], box["top"], box["x1"], box["bottom"]))
            img = crop.to_image(resolution=dpi).original.convert("RGB")
            img.save(out_dir / f"vector-{dpi}dpi.png")
            rows.append(
                {
                    "dpi": dpi,
                    "px": f"{img.width}x{img.height}",
                    "sharpness_at_512": round(sharpness(img, at_width=512), 1),
                }
            )
            shots.append((f"{dpi} dpi", img))
    comparison_sheet(
        shots, f"vector artwork — {Path(pdf_path).name} p{page_no}",
        out_dir / "vector-comparison.png",
    )
    (out_dir / "vector.json").write_text(json.dumps(rows, indent=2))
    for row in rows:
        print(f"  {row['dpi']:>3} dpi  {row['px']:<12} "
              f"detail@512 {row['sharpness_at_512']}")
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf")
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--vector", type=int, default=0,
                        help="also test this many products from raster-free pages")
    parser.add_argument("--pages", default=None, help="e.g. 60-80")
    parser.add_argument(
        "--out", default=str(HERE / "data" / "extraction-test"),
    )
    parser.add_argument(
        "--vector-demo",
        type=int,
        default=0,
        metavar="PAGE",
        help="skip the product test; measure vector detail against DPI "
             "on this page instead",
    )
    args = parser.parse_args()

    pdf_path = Path(args.pdf).expanduser()
    if not pdf_path.exists():
        sys.exit(f"no such PDF: {pdf_path}")

    out = Path(args.out) / re.sub(r"[^A-Za-z0-9._-]", "-", pdf_path.stem)[:40]
    if args.vector_demo:
        print(f"vector detail against DPI — {pdf_path.name} p{args.vector_demo}")
        vector_demo(pdf_path, out, args.vector_demo, (0.08, 0.30, 0.55, 0.70))
        print(f"\nwritten to {out}")
        return
    run(pdf_path, out, args.count, args.pages, args.vector)
    print(f"\nwritten to {out}")


if __name__ == "__main__":
    main()
