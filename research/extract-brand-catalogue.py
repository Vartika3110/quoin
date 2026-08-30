"""Pull products and their photography out of a manufacturer's PDF catalogue.

A dealer catalogue carries what the competitor scrapes never did: the
manufacturer's own product code, its current price, a written description
and a photograph Quoin is entitled to show. This turns one into a JSON
manifest plus an image per product, ready for `npm run db:import-brand`.

The layout is a grid of cells — an image with its code, description and
price stacked underneath. `extract_text()` interleaves the columns and is
useless here, so everything works from word coordinates instead: cluster
the codes into columns, take the words beneath each one down to the next
code in that column, and claim the image sitting directly above it.

    python research/extract-brand-catalogue.py jaquar "CG VOL. 22.pdf" out/

Needs pdfplumber, pillow and pypdfium2 (the renderer):

    python3 -m venv .venv
    .venv/bin/pip install pdfplumber pillow pypdfium2
"""
import hashlib
import io
import json
import re
import sys
from pathlib import Path

import pdfplumber
from PIL import Image

# --- per-brand layout -----------------------------------------------------
#
# Only the code shape and the price marker differ between catalogues; the
# grid logic below is shared. Adding a brand is adding an entry here.
BRANDS = {
    "jaquar": {
        "code": re.compile(r"^[A-Z]{2,4}-[A-Z0-9]{2,}-[A-Z0-9]{2,}$"),
        "price": re.compile(r"Rs\.?\s*([\d,]+)"),
    },
    # The technical catalogue omits the finish segment the price list
    # carries: ARI-39441K here is ARI-CHR-39441K there. Same products,
    # and the importer reconciles the two forms.
    "jaquar-technical": {
        "code": re.compile(r"^[A-Z]{2,4}-[A-Z0-9]{3,}$"),
        "price": re.compile(r"Rs\.?\s*([\d,]+)"),
    },
    # A table, not a grid: code, description and price run across a row,
    # and one line frequently carries two products side by side.
    #
    # Ozone, not Ebco: the catalogue cover reads "Kitchen Fittings by
    # Ozone" and every code carries an OZ-/OE-/OEC/OEAP prefix. It was
    # imported under the wrong brand once already.
    "ozone": {
        "layout": "table",
        "row": re.compile(
            r"([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\s+(.*?)[`₹]\s*([\d,]+)"
        ),
        "code": re.compile(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$"),
        "price": re.compile(r"[`₹]\s*([\d,]+)"),
    },
}

#: Below this an image is an icon, a rule or a logo, not a product.
MIN_IMAGE_PX = 60

#: An image more than this far above its code belongs to another row.
MAX_IMAGE_GAP = 220

#: Codes within this many points of each other share a column.
COLUMN_TOLERANCE = 90

#: Enough for a 400px catalogue tile from a ~120pt box, and no more —
#: 1,800 products at print resolution is gigabytes nobody will serve.
RENDER_DPI = 200


def to_paise(raw):
    """'3,600' -> 360000. Integer paise, never float rupees."""
    digits = re.sub(r"[^\d]", "", raw or "")
    return int(digits) * 100 if digits else None


def column_bounds(codes, page_width):
    """Left/right edge of each column, from where the columns actually are.

    A fixed margin around the code is not enough: a description is wider
    than its code, so a generous margin swallows the neighbour's first
    word and a tight one truncates. Splitting at the midpoint between
    adjacent column centres puts the boundary where the page puts it.
    """
    centres = sorted({round((c["x0"] + c["x1"]) / 2) for c in codes})

    merged = []
    for c in centres:
        if merged and c - merged[-1] < COLUMN_TOLERANCE:
            continue
        merged.append(c)

    bounds = []
    for i, centre in enumerate(merged):
        left = 0 if i == 0 else (merged[i - 1] + centre) / 2
        right = page_width if i == len(merged) - 1 else (centre + merged[i + 1]) / 2
        bounds.append((left, right))
    return merged, bounds


def cell_words(words, code_word, column_codes, page_bottom, bounds):
    """Words belonging to one product: beneath its code, above the next."""
    below = [c["top"] for c in column_codes if c["top"] > code_word["top"] + 2]
    limit = min(below) if below else page_bottom

    centre = (code_word["x0"] + code_word["x1"]) / 2
    left, right = next(
        (b for b in bounds if b[0] <= centre <= b[1]),
        (code_word["x0"] - COLUMN_TOLERANCE, code_word["x1"] + COLUMN_TOLERANCE),
    )

    return [
        w
        for w in words
        if code_word["bottom"] <= w["top"] < limit
        # a word counts as in-column when its own centre is
        and left <= (w["x0"] + w["x1"]) / 2 <= right
    ]


#: Column headers and page furniture, never a product name.
NOT_A_HEADING = re.compile(
    r"^(product code|description|mrp|key features|specifications|note|page)\b", re.I
)


def is_heading(line):
    """A section title: the product name, printed once above its table.

    Ebco names a range in a heading and then lists only sizes and finishes
    in the rows beneath, so without this every product is called "500MM
    ANTHGREY". Headings are set in capitals, which is what separates them
    from the sentence-case prose around them.
    """
    text = line.strip()
    if len(text) < 8 or "`" in text or NOT_A_HEADING.match(text):
        return False

    letters = [c for c in text if c.isalpha()]
    if len(letters) < 6:
        return False

    return sum(1 for c in letters if c.isupper()) / len(letters) > 0.85


def tidy_heading(line):
    """Strips the doubled-letter "NNeeww" flash the catalogue overlays."""
    text = re.sub(r"\b(?:NN?ee?ww?|New)\b", "", line).strip()
    text = re.sub(r"(.)\1{2,}", r"\1", text)
    return re.sub(r"\s+", " ", text).strip(" -|")


def extract_table(brand, pdf_path, out_dir):
    """Read a priced table, one product per match rather than per cell.

    Ebco publishes rows — code, description, price, left to right — and
    often two products on one printed line. The cell reader used for
    Jaquar looks *below* a code for its price and finds nothing here.

    Photographs are not claimed per row. A table like this carries one
    picture for a whole family of variants, so attaching it to each code
    would put the same image on products that differ in exactly the way
    the picture would need to show. They go to the pairing screen instead.
    """
    spec = BRANDS[brand]
    records = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            heading = None

            for line in (page.extract_text() or "").split("\n"):
                if is_heading(line):
                    heading = tidy_heading(line)
                    continue

                for code, middle, price in spec["row"].findall(line):
                    variant = re.sub(r"\s+", " ", middle).strip(" .,-")
                    records.append(
                        {
                            "code": code,
                            # The row says "500MM ANTHGREY"; what the thing
                            # *is* was printed once, in the heading above.
                            "description": heading,
                            "variant": variant or None,
                            "pricePaise": to_paise(price),
                            "page": page_no,
                            "image": None,
                        }
                    )

            if page_no % 25 == 0:
                print(f"  page {page_no}: {len(records)} products so far", flush=True)

    return records


def extract(brand, pdf_path, out_dir):
    spec = BRANDS[brand]
    images_dir = Path(out_dir) / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    records = []
    seen_images = {}

    with pdfplumber.open(pdf_path) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            words = page.extract_words()
            codes = [w for w in words if spec["code"].match(w["text"])]
            if not codes:
                continue

            pictures = [
                im
                for im in page.images
                if (im["x1"] - im["x0"]) >= MIN_IMAGE_PX
                and (im["bottom"] - im["top"]) >= MIN_IMAGE_PX
            ]

            _, bounds = column_bounds(codes, page.width)

            for code_word in codes:
                code = code_word["text"]
                column = [c for c in codes if abs(c["x0"] - code_word["x0"]) < COLUMN_TOLERANCE]

                text = " ".join(
                    w["text"]
                    for w in cell_words(words, code_word, column, page.height, bounds)
                )
                price = spec["price"].search(text)

                # Description is everything before the price, minus repeated codes.
                description = text[: price.start()] if price else text
                description = spec["code"].sub("", description)
                description = re.sub(r"\s+", " ", description).strip(" .,-")

                # The image directly above this code, in the same column.
                centre = (code_word["x0"] + code_word["x1"]) / 2
                above = [
                    im
                    for im in pictures
                    if im["bottom"] <= code_word["top"] + 5
                    and code_word["top"] - im["bottom"] <= MAX_IMAGE_GAP
                    and im["x0"] - 40 <= centre <= im["x1"] + 40
                ]
                image_name = None
                if above:
                    best = min(above, key=lambda im: code_word["top"] - im["bottom"])
                    image_name = save_image(page, best, code, images_dir, seen_images, words)

                records.append(
                    {
                        "code": code,
                        "description": description or None,
                        "pricePaise": to_paise(price.group(1)) if price else None,
                        "page": page_no,
                        "image": image_name,
                    }
                )

            if page_no % 25 == 0:
                print(f"  page {page_no}: {len(records)} products so far", flush=True)

    return records


def trim_to_artwork(box, words):
    """Pulls the crop past any page text overlapping the image's box.

    An image's box frequently runs under the section header above it or
    the code beneath it, and rendering the box verbatim bakes that text
    into the product photograph. Only the edges are trimmed — text
    crossing the middle of a product is part of the artwork.
    """
    top, bottom = box["top"], box["bottom"]
    height = bottom - top
    if height <= 0:
        return top, bottom

    edge = height * 0.28

    for w in words:
        # Ignore words that do not overlap horizontally at all.
        if w["x1"] <= box["x0"] or w["x0"] >= box["x1"]:
            continue
        if w["bottom"] <= top or w["top"] >= bottom:
            continue

        if w["bottom"] <= top + edge:
            top = max(top, w["bottom"] + 1)
        elif w["top"] >= bottom - edge:
            bottom = min(bottom, w["top"] - 1)

    return (top, bottom) if bottom - top > height * 0.4 else (box["top"], box["bottom"])


def save_image(page, box, code, images_dir, seen, words=()):
    """Renders the product's region of the page and writes it as a JPEG.

    Rendering rather than pulling the embedded stream out. These images
    carry an alpha mask and sit on a transparent ground, so the raw stream
    decodes to a product silhouetted on black — technically the right
    bytes, useless as a photograph. Rendering composites the mask onto
    white the way the page itself displays it, and costs nothing else.
    """
    top, bottom = trim_to_artwork(box, words)

    try:
        crop = page.crop((box["x0"], top, box["x1"], bottom))
        rendered = crop.to_image(resolution=RENDER_DPI).original
    except Exception:
        return None

    # Flatten onto white: a JPEG has no alpha, and the default is black.
    if rendered.mode in ("RGBA", "LA", "P"):
        rendered = rendered.convert("RGBA")
        canvas = Image.new("RGB", rendered.size, "white")
        canvas.paste(rendered, mask=rendered.split()[-1])
        rendered = canvas
    else:
        rendered = rendered.convert("RGB")

    buffer = io.BytesIO()
    rendered.save(buffer, "JPEG", quality=85, optimize=True)
    data = buffer.getvalue()

    digest = hashlib.md5(data).hexdigest()
    if digest in seen:
        return seen[digest]

    name = f"{re.sub(r'[^A-Za-z0-9._-]', '_', code)}.jpg"
    (images_dir / name).write_bytes(data)
    seen[digest] = name
    return name


def harvest(pdf_path, out_dir):
    """Pull every product-sized image out, without claiming to know what it is.

    Most manufacturer catalogues are not the priced grid Jaquar publishes:
    Häfele lists five finish article numbers per table row, Simonswerk
    outlines its text as artwork, and the CPVC document extracts mirrored.
    Guessing a code for an image out of those would attach the wrong
    photograph to a real SKU, which is worse than attaching none.

    So this takes the photographs and records only what it actually knows
    — which page each came from — leaving a human to say what they are.
    """
    images_dir = Path(out_dir) / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    seen = {}
    records = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            words = page.extract_words()
            pictures = [
                im
                for im in page.images
                if (im["x1"] - im["x0"]) >= MIN_IMAGE_PX
                and (im["bottom"] - im["top"]) >= MIN_IMAGE_PX
            ]
            for i, box in enumerate(pictures):
                name = save_image(page, box, f"p{page_no:04d}-{i:02d}", images_dir, seen, words)
                if name:
                    records.append({"image": name, "page": page_no})

            if page_no % 50 == 0:
                print(f"  page {page_no}: {len(records)} images", flush=True)

    return records


def main():
    if "--harvest" in sys.argv:
        args = [a for a in sys.argv[1:] if not a.startswith("--")]
        if len(args) < 3:
            sys.exit("usage: --harvest <name> <catalogue.pdf> <out-dir>")
        name, pdf_path, out_dir = args[0], args[1], args[2]

        print(f"harvesting images from {pdf_path}")
        records = harvest(pdf_path, out_dir)

        manifest = Path(out_dir) / f"{name}-images.json"
        manifest.write_text(json.dumps({"brand": name, "images": records}, indent=1))
        print(f"\n{len(records)} distinct images -> {manifest}")
        return

    if len(sys.argv) < 4:
        sys.exit(f"usage: {sys.argv[0]} <{'|'.join(BRANDS)}> <catalogue.pdf> <out-dir>")

    brand, pdf_path, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    if brand not in BRANDS:
        sys.exit(f"unknown brand '{brand}' — known: {', '.join(BRANDS)}")

    print(f"reading {pdf_path}")
    if BRANDS[brand].get("layout") == "table":
        records = extract_table(brand, pdf_path, out_dir)
    else:
        records = extract(brand, pdf_path, out_dir)

    priced = [r for r in records if r["pricePaise"]]
    with_image = [r for r in records if r["image"]]

    manifest = Path(out_dir) / f"{brand}-catalogue.json"
    manifest.write_text(json.dumps({"brand": brand, "products": records}, indent=1))

    print(f"\n{len(records)} products")
    print(f"  with a price: {len(priced)}")
    print(f"  with an image: {len(with_image)}")
    print(f"  usable (both): {len([r for r in records if r['pricePaise'] and r['image']])}")
    print(f"manifest: {manifest}")


if __name__ == "__main__":
    main()
