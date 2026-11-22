"""Pull every product picture out of a PDF at the resolution it was stored.

The difference between this and `extract-catalogue-sheet.py` is where the
pixels come from. That one renders a region of the page, which is right
when you want what the page *looks* like — artwork, text and all — and
wrong when you want the photograph itself: a render is capped at whatever
DPI you asked for, and it bakes in the page's background.

This takes the embedded image stream instead. A PDF stores each placed
photograph once, at its own resolution, usually as a JPEG; pulling that
stream out is lossless and gives exactly the pixels the manufacturer's
designer placed. Where the catalogue supplies a soft mask — the alpha
channel that makes a tap float on the page — that comes out too, so the
product can be composited onto white instead of onto black.

Vector artwork has no stream and no native resolution, so it is rendered,
at a DPI high enough that it does not matter.

    .venv/bin/python research/extract-catalogue-images.py \
        ~/Desktop/catalogues-to-extract/"ziva oct.pdf" out/ziva --brand Anchor

    ... --vector-dpi 300 --min-pt 40 --limit-pages 1-20

Writes `images/` and a `rows.json` in the same shape
`enhance-product-images.py` already reads, so extraction and grading are
two commands rather than one tangled one.

**Nothing is recompressed.** A JPEG stream is written out byte for byte
under its own extension. The only pixels this program creates are the
ones it renders from vectors, and the orientation correction below.

Needs PyMuPDF, Pillow and NumPy:

    .venv/bin/pip install pymupdf pillow numpy
"""

import argparse
import hashlib
import importlib.util
import io
import json
import re
import sys
from pathlib import Path

import fitz
import numpy as np
from PIL import Image

# `is_code` and the price pattern are defined once, in the sheet
# extractor, and imported here rather than copied. They encode which
# shapes of token a catalogue uses for a SKU, and two divergent copies of
# that judgement is how one extractor starts disagreeing with the other.
_sheet_path = Path(__file__).with_name("extract-catalogue-sheet.py")
_spec = importlib.util.spec_from_file_location("catalogue_sheet", _sheet_path)
_sheet = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sheet)

is_code = _sheet.is_code
PRICE = _sheet.PRICE
tidy = _sheet.tidy

#: Smaller than this on the page and it is an icon, a rule or a logo.
#: Low, deliberately. A switch price list prints its products at 38x33pt
#: — a 53x46px photograph — and a floor set where a product-sized image
#: "ought" to be throws the whole catalogue away. What separates a
#: product from a bullet here is not size, it is whether the page printed
#: a catalogue number under it; see `caption_for`.
MIN_DRAWN_PT = 24

#: And smaller than this in its own pixels and there is nothing to show.
MIN_NATIVE_PX = 44

#: A picture covering more of the page than this is a background.
MAX_PAGE_SHARE = 0.72

#: What vector artwork is rendered at. Vectors have no native size, so
#: this is a choice rather than a measurement: 300 DPI puts a 120pt
#: drawing at 500px, which clears the storefront's needs.
VECTOR_DPI = 300

#: A looser code shape, used *only* for the candidates printed beside a
#: picture, never for a confident match.
#:
#: GM's long form — 10AE1032XSK — begins with a digit, which the shared
#: `is_code` refuses because relaxing it there would make "450MM" a SKU
#: and corrupt the sheet extractor's variant column. Here that trade is
#: safe: everything this matches is already marked as needing a person's
#: confirmation, so a false positive costs a glance, not a wrong SKU.
NEARBY_CODE = re.compile(r"^(?=.*[A-Z])(?=.*\d)[A-Z0-9][A-Z0-9./-]{3,23}$")

#: ...except a measurement, which is what most digit-leading tokens are.
MEASUREMENT_TOKEN = re.compile(
    r"^\d+(?:\.\d+)?(?:MM|CM|M|KG|G|ML|L|W|V|A|AMP|MHZ|CAT)\d*$", re.I
)


def is_nearby_code(token):
    text = (token or "").strip(".,;:()*")
    if not NEARBY_CODE.match(text) or MEASUREMENT_TOKEN.match(text):
        return False
    return True


#: How far below or beside a picture to read its caption, in points.
CAPTION_BELOW_PT = 54
CAPTION_BESIDE_PT = 260


def sha1(data):
    return hashlib.sha1(data).hexdigest()


def page_numbers(spec, total):
    if not spec:
        return range(1, total + 1)
    if "-" in spec:
        first, last = spec.split("-", 1)
        return range(max(1, int(first)), min(total, int(last)) + 1)
    return range(int(spec), min(total, int(spec)) + 1)


# --- orientation ----------------------------------------------------------


def orientation_from_matrix(transform):
    """How the page draws a stored image, read off its placement matrix.

    A PDF stores an image unrotated and places it with a matrix, so the
    stream on disk is sometimes a mirror of what the reader sees. Getting
    this wrong is the worst kind of quiet error: a mirrored lever handle
    is still a plausible photograph of a tap, just not of *this* tap.

    This was first done by rendering the page region and asking which
    flip matched. That looked sensible and was worthless — these images
    carry an alpha channel, so the candidate and the render were never
    comparable, and the four scores came out within noise of each other
    (186.4, 189.2, 189.1, 185.6 on one G-HOME lamp). It "corrected" 8 of
    48 GROHE BAU images whose matrices say, unanimously, that none of
    them is flipped at all.

    The matrix is not a guess. `a` and `d` carry the scale on each axis
    and a negative one is a mirror; `b` and `c` are zero unless the
    placement is turned. Quarter turns are left alone and reported rather
    than guessed at — they are a handful of images, and a wrong guess
    costs more than an uncorrected one a person can see in the sheet.
    """
    a, b, c, d = transform[0], transform[1], transform[2], transform[3]
    turned = abs(b) > 1e-6 or abs(c) > 1e-6

    if turned:
        return None, "turned placement — left as stored"

    flip_h = a < 0
    flip_v = d < 0

    if flip_h and flip_v:
        return Image.ROTATE_180, "rotate-180"
    if flip_h:
        return Image.FLIP_LEFT_RIGHT, "flip-horizontal"
    if flip_v:
        return Image.FLIP_TOP_BOTTOM, "flip-vertical"
    return None, "as-stored"


#: A grayscale image that is all pure black and pure white is a stencil —
#: a drop shadow or a cut-out shape the layout paints with — not a
#: photograph of anything.
STENCIL_EXTREME_SHARE = 0.985


def looks_like_stencil(raster, colorspace):
    """Whether this stream is a mask the page paints with, not a product."""
    if colorspace not in (0, 1):  # anything with real colour is a photo
        return False
    try:
        sample = raster.convert("L").resize((48, 48), Image.NEAREST)
    except Exception:
        return False
    values = np.asarray(sample, dtype=np.uint8)
    extremes = float(((values < 8) | (values > 247)).mean())
    return extremes >= STENCIL_EXTREME_SHARE


# --- captions -------------------------------------------------------------


def caption_for(page, bbox):
    """The text printed under a picture, and separately, beside it.

    The distinction is the whole point, and it is a SKU-safety one. In a
    price list the products sit in a block on the left and the price
    table runs down the right, so text *beside* a photograph is routinely
    a different product's row. A code printed directly underneath is the
    page saying "this picture is that item"; a code to the right is a
    coincidence of layout until a person confirms it.

    So both are recorded and they are never merged. `cat_nos` is only
    ever filled from underneath, and `matchConfidence` says which it was,
    so that nothing downstream can publish a guess as a fact.
    """
    below_box = fitz.Rect(bbox.x0 - 12, bbox.y1, bbox.x1 + 12, bbox.y1 + CAPTION_BELOW_PT)
    beside_box = fitz.Rect(bbox.x1, bbox.y0 - 4, bbox.x1 + CAPTION_BESIDE_PT, bbox.y1 + 4)

    below = (page.get_textbox(below_box) or "").strip()
    beside = (page.get_textbox(beside_box) or "").strip()

    def codes_in(text):
        """Codes in a caption, including the ones printed with spaces in.

        GM sets its short codes as "AE 2 142" and Anchor sets its as
        "68001". Splitting on whitespace finds the second and loses the
        first, so each printed *line* is also tested with its spaces
        removed — but only a short line, because "AE 1 032 AE 1 043" is
        two codes sharing a caption row and joining those would mint a
        SKU that does not exist.
        """
        found = []
        for line in text.split("\n"):
            tokens = line.split()
            found += [t.strip(".,;:()") for t in tokens if is_code(t.strip(".,;:()"))]

            if not found and 2 <= len(tokens) <= 4:
                joined = "".join(tokens).strip(".,;:()")
                if len(joined) <= 14 and is_code(joined):
                    found.append(joined)

        seen, unique = set(), []
        for code in found:
            if code not in seen:
                seen.add(code)
                unique.append(code)
        return unique

    below_codes = codes_in(below)
    beside_codes = codes_in(beside) + [
        t.strip(".,;:()*")
        for t in beside.split()
        if is_nearby_code(t) and not is_code(t.strip(".,;:()"))
    ]
    beside_codes = list(dict.fromkeys(beside_codes))

    # Three ways a page can identify a picture, and they are not equally
    # trustworthy.
    #
    #   below  — the code is printed under the photograph. A fact.
    #   row    — the band beside the photograph holds exactly one code.
    #            That is a table row: photo, code, description, price,
    #            left to right, which is how GROHE's price list is set.
    #            The row is the unit, so the match is sound.
    #   beside — the band holds several codes. That is a photo grid
    #            sitting next to a price table, as GM sets it, and the
    #            code nearest the picture is routinely another product's.
    #            A candidate, never an assignment.
    if below_codes:
        confidence = "below"
    elif len(beside_codes) == 1:
        confidence = "row"
    elif beside_codes:
        confidence = "beside"
    else:
        confidence = "none"

    name = below
    for code in below_codes:
        name = name.replace(code, " ")
    name = PRICE.sub(" ", name)

    price = PRICE.search(below) or PRICE.search(beside)

    return {
        "caption": tidy(below)[:300],
        # Only ever from underneath. A code beside a picture is a
        # candidate for a person to confirm, not an assignment.
        "cat_nos": below_codes[0] if below_codes else "",
        "cat_nos_nearby": beside_codes[:4],
        "matchConfidence": confidence,
        "item": tidy(name)[:160],
        "price_text": price.group(0) if price else "",
    }


# --- one PDF --------------------------------------------------------------


def extract(pdf_path, out_dir, args):
    doc = fitz.open(pdf_path)
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    seen_digest = {}
    stats = {
        "pages": 0,
        "raster": 0,
        "vector": 0,
        "inline": 0,
        "skipped_small": 0,
        "skipped_background": 0,
        "reoriented": 0,
        "duplicates": 0,
        "failed": 0,
        "stencils": 0,
    }

    for number in page_numbers(args.limit_pages, len(doc)):
        page = doc[number - 1]
        stats["pages"] += 1
        page_area = max(page.rect.width * page.rect.height, 1)
        placed = []

        for info in page.get_image_info(xrefs=True):
            bbox = fitz.Rect(info["bbox"])
            drawn_w, drawn_h = bbox.width, bbox.height

            if drawn_w < args.min_pt or drawn_h < args.min_pt:
                stats["skipped_small"] += 1
                continue
            if (bbox.width * bbox.height) / page_area > MAX_PAGE_SHARE:
                stats["skipped_background"] += 1
                continue
            if info["width"] < MIN_NATIVE_PX or info["height"] < MIN_NATIVE_PX:
                stats["skipped_small"] += 1
                continue

            placed.append(bbox)
            xref = info.get("xref", 0)

            if not xref:
                # An inline image has no object of its own to extract, so
                # the only way to get it is to render where it sits.
                stats["inline"] += 1
                row = render_region(
                    page, bbox, number, images_dir, seen_digest, args, kind="inline"
                )
                if row:
                    row.update(caption_for(page, bbox))
                    rows.append(row)
                continue

            try:
                raw = doc.extract_image(xref)
            except Exception:
                stats["failed"] = stats.get("failed", 0) + 1
                continue
            if not raw or not raw.get("image"):
                continue

            digest = sha1(raw["image"])
            stem = f"x{xref:05d}_p{number:03d}"
            row = None

            if digest in seen_digest:
                stats["duplicates"] += 1
                first = seen_digest[digest]
                rows.append(
                    {
                        **first,
                        "folio": number,
                        "bbox": [round(v, 1) for v in bbox],
                        "reused": True,
                        **caption_for(page, bbox),
                    }
                )
                continue

            extension = raw.get("ext", "png")
            try:
                raster = Image.open(io.BytesIO(raw["image"]))
                if looks_like_stencil(raster, raw.get("colorspace", 3)):
                    stats["stencils"] = stats.get("stencils", 0) + 1
                    continue
                operation, how = orientation_from_matrix(info["transform"])
                oriented = raster.transpose(operation) if operation else raster
            except Exception:
                stats["failed"] = stats.get("failed", 0) + 1
                continue
            if operation is None:
                # Byte-for-byte: no decode, no re-encode, no loss.
                name = f"{stem}.{extension}"
                (images_dir / name).write_bytes(raw["image"])
            else:
                # It had to be flipped, so it has to be re-encoded. PNG,
                # because re-encoding a JPEG as a JPEG loses a little more
                # every time and these are already compression-starved.
                #
                # Converted to RGB first where the stream is not already in
                # a mode PNG can hold. GROHE's print catalogue stores CMYK
                # JPEGs — correct for a press, unwritable as PNG, and
                # unusable in a browser either way.
                try:
                    if oriented.mode not in ("RGB", "RGBA", "L", "LA", "P"):
                        oriented = oriented.convert("RGB")
                    name = f"{stem}.png"
                    oriented.save(images_dir / name, "PNG", optimize=True)
                except Exception:
                    # Could not be rewritten in the orientation the page
                    # draws it. The stream itself is still good, so keep
                    # it as stored and say so rather than losing it.
                    name = f"{stem}.{extension}"
                    (images_dir / name).write_bytes(raw["image"])
                    how = "as-stored (flip failed)"

            if operation is not None:
                stats["reoriented"] += 1

            mask_name = None
            if raw.get("smask"):
                try:
                    alpha = doc.extract_image(raw["smask"])
                    mask_image = Image.open(io.BytesIO(alpha["image"])).convert("L")
                    if operation is not None:
                        mask_image = mask_image.transpose(operation)
                    mask_name = f"{stem}_mask.png"
                    mask_image.save(images_dir / mask_name, "PNG", optimize=True)
                except Exception:
                    mask_name = None

            effective_dpi = round(info["width"] / (drawn_w / 72)) if drawn_w else 0
            row = {
                "kind": "product",
                "file": name,
                "mask_file": mask_name,
                "sha1": digest,
                "xref": xref,
                "px_w": info["width"],
                "px_h": info["height"],
                "drawn_w": round(drawn_w, 1),
                "drawn_h": round(drawn_h, 1),
                "effective_dpi": effective_dpi,
                "format": extension,
                "orientation": how,
                "source": "embedded-raster",
                "folio": number,
                "bbox": [round(v, 1) for v in bbox],
                "reused": False,
            }
            seen_digest[digest] = {
                k: row[k]
                for k in (
                    "kind", "file", "mask_file", "sha1", "px_w", "px_h",
                    "source", "effective_dpi", "format", "orientation",
                    "drawn_w", "drawn_h", "xref",
                )
            }
            caption = caption_for(page, bbox)
            row.update(caption)
            # Unidentified is not a failure — a lifestyle shot has no code
            # either — but it must not look like an identified product.
            if caption["matchConfidence"] == "none":
                row["kind"] = "unidentified"
            elif caption["matchConfidence"] == "row" and not caption["cat_nos"]:
                # A single code in the band beside a picture is that row's
                # code, so record it rather than leaving the column empty.
                row["cat_nos"] = caption["cat_nos_nearby"][0]
            rows.append(row)
            stats["raster"] += 1

        if args.vectors:
            for bbox in vector_clusters(page, placed, args):
                row = render_region(
                    page, bbox, number, images_dir, seen_digest, args, kind="vector"
                )
                if row:
                    row.update(caption_for(page, bbox))
                    rows.append(row)
                    stats["vector"] += 1

        if number % 25 == 0:
            print(f"  page {number}: {len(rows)} images so far", flush=True)

    doc.close()
    return rows, stats


def vector_clusters(page, already_placed, args):
    """Product-shaped groups of vector paths that no raster covers.

    Two of the catalogues on this machine contain no raster images at
    all — every product is line art. Those have no native resolution to
    preserve and no stream to extract, so the only question is what to
    render them at, and the answer is "enough".
    """
    boxes = []
    for drawing in page.get_drawings():
        rect = drawing.get("rect")
        if rect is None or rect.is_empty or rect.is_infinite:
            continue
        if rect.width < 6 or rect.height < 6:
            continue
        boxes.append(fitz.Rect(rect))

    if not boxes:
        return []

    # Union anything that touches, the same way the sheet extractor joins
    # a photograph sliced into strips.
    merged = []
    changed = True
    while changed:
        changed = False
        merged = []
        for box in boxes:
            for other in merged:
                if fitz.Rect(other).intersects(box + (-4, -4, 4, 4)):
                    other |= box
                    changed = True
                    break
            else:
                merged.append(fitz.Rect(box))
        boxes = merged

    page_area = max(page.rect.width * page.rect.height, 1)
    out = []
    for box in merged:
        if box.width < args.min_pt or box.height < args.min_pt:
            continue
        if (box.width * box.height) / page_area > MAX_PAGE_SHARE:
            continue
        if any(fitz.Rect(p).intersects(box) for p in already_placed):
            continue
        out.append(box)
    return out


def render_region(page, bbox, number, images_dir, seen_digest, args, kind):
    """Render a region of the page, for vectors and inline images."""
    try:
        pixmap = page.get_pixmap(clip=bbox, dpi=args.vector_dpi, alpha=False)
        data = pixmap.tobytes("png")
    except Exception:
        return None

    digest = sha1(data)
    if digest in seen_digest:
        return None

    stem = f"v{int(bbox.x0):04d}{int(bbox.y0):04d}_p{number:03d}"
    name = f"{stem}.png"
    (images_dir / name).write_bytes(data)

    row = {
        "kind": "product",
        "file": name,
        "mask_file": None,
        "sha1": digest,
        "xref": 0,
        "px_w": pixmap.width,
        "px_h": pixmap.height,
        "drawn_w": round(bbox.width, 1),
        "drawn_h": round(bbox.height, 1),
        "effective_dpi": args.vector_dpi,
        "format": "png",
        "orientation": "rendered",
        "source": "vector-render" if kind == "vector" else "inline-render",
        "folio": number,
        "bbox": [round(v, 1) for v in bbox],
        "reused": False,
    }
    seen_digest[digest] = {
        k: row[k]
        for k in (
            "kind", "file", "mask_file", "sha1", "px_w", "px_h", "source",
            "effective_dpi", "format", "orientation", "drawn_w", "drawn_h", "xref",
        )
    }
    return row


# --- entry point ----------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Embedded-resolution image extraction from catalogue PDFs."
    )
    parser.add_argument("pdf")
    parser.add_argument("out_dir")
    parser.add_argument("--brand", default="", help="brand these products belong to")
    parser.add_argument("--series", default="", help="range name, when the file is one range")
    parser.add_argument("--min-pt", type=float, default=MIN_DRAWN_PT)
    parser.add_argument("--vector-dpi", type=int, default=VECTOR_DPI)
    parser.add_argument(
        "--vectors", action="store_true",
        help=(
            "also render vector artwork. Off by default: in a price list "
            "laid out in InDesign, the vector paths are the layout — rules, "
            "panels and rounded boxes — and rendering them yields page "
            "furniture, not products. Turn it on for a catalogue whose "
            "products are line art, which is a catalogue with almost no "
            "embedded rasters at all."
        ),
    )
    parser.add_argument("--limit-pages", help="e.g. 1-20")
    args = parser.parse_args()

    pdf_path = Path(args.pdf).expanduser()
    if not pdf_path.exists():
        sys.exit(f"no such file: {pdf_path}")

    out_dir = Path(args.out_dir).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"reading {pdf_path.name}")
    rows, stats = extract(pdf_path, out_dir, args)

    for row in rows:
        row.setdefault("series", args.series)
        row.setdefault("brand", args.brand)

    manifest = out_dir / "rows.json"
    manifest.write_text(
        json.dumps(
            {
                "source_pdf": pdf_path.name,
                "brand": args.brand,
                "series": args.series,
                "stats": stats,
                "images": rows,
            },
            indent=1,
            ensure_ascii=False,
        )
    )

    distinct = len({r["sha1"] for r in rows})
    with_mask = len([r for r in rows if r.get("mask_file")])
    # Counted by which rule matched, not by whether a code ended up in
    # the column: a row-matched picture also carries a code, and counting
    # those as "printed underneath" overstates the confident set.
    with_code = len([r for r in rows if r.get("matchConfidence") == "below"])
    row_matched = len([r for r in rows if r.get("matchConfidence") == "row"])
    nearby_only = len([r for r in rows if r.get("matchConfidence") == "beside"])
    unidentified = len([r for r in rows if r.get("kind") == "unidentified"])
    dpis = sorted(
        r["effective_dpi"] for r in rows
        if r.get("source") == "embedded-raster" and r.get("effective_dpi")
    )

    print(f"\n{len(rows)} placement(s), {distinct} distinct image(s)")
    print(f"  embedded rasters {stats['raster']}, vector renders {stats['vector']}, "
          f"inline {stats['inline']}")
    print(f"  with an alpha mask: {with_mask}")
    print(f"  catalogue number printed underneath: {with_code}")
    print(f"  matched by its table row: {row_matched}")
    print(f"  a number only beside it (needs confirming): {nearby_only}")
    print(f"  nothing identifying it at all: {unidentified}")
    if stats["reoriented"]:
        print(f"  {stats['reoriented']} corrected for a mirrored or rotated placement")
    if dpis:
        print(f"  embedded at {dpis[len(dpis)//2]} DPI (median)")
    print(f"  skipped: {stats['skipped_small']} too small, "
          f"{stats['skipped_background']} page-sized")
    if stats.get("stencils"):
        print(f"  {stats['stencils']} stencil/shadow stream(s) skipped")
    if stats.get("failed"):
        print(f"  {stats['failed']} stream(s) could not be decoded")
    print(f"manifest: {manifest}")


if __name__ == "__main__":
    main()
