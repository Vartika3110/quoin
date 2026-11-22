"""Turn supplier PDFs into one reviewable spreadsheet of products.

`extract-brand-catalogue.py` reads a catalogue whose layout somebody has
already described in its `BRANDS` table, and it is the better tool for a
catalogue that is in there. This one is for the arrival of a PDF nobody
has looked at yet: four brands land in an inbox, and the question is what
is in them, not how their grid is laid out.

So nothing here is per-brand. Every row is anchored on a **photograph**,
because a photograph is the one thing a product page cannot do without
and the one thing these documents always carry. For each picture it takes
the caption printed beneath it, pulls a code, a price and a name out of
that caption, and names the series from the heading above. What it is not
sure about it says so in the Notes column rather than guessing quietly.

The output is an .xlsx with one sheet per brand, a thumbnail in every row
and an empty **Your price** column. That column is the point: the
catalogue's own MRP is recorded next to it for reference, but what the
storefront charges is a decision, not an extraction. A human highlights
the rows worth selling, fills that column, and
`prisma/import-approved-sheet.ts` imports exactly those.

    .venv/bin/python research/extract-catalogue-sheet.py OUT_DIR PDF...
    .venv/bin/python research/extract-catalogue-sheet.py out/ a.pdf b.pdf \
        --brand Hindware --brand Jaquar          # one per PDF, in order
    ... --categories research/data/categories.json   # fills the dropdown
    ... --pages 1-40                                 # a sample, for a look

Needs the project virtualenv (pdfplumber, pillow, pypdfium2, openpyxl):

    python3 -m venv .venv
    .venv/bin/pip install pdfplumber pillow pypdfium2 openpyxl pymupdf
"""

import argparse
import hashlib
import io
import json
import re
import statistics
import sys
from pathlib import Path

import fitz
import pdfplumber
from PIL import Image

# --- what counts as a product photograph ----------------------------------

#: Below this, in PDF points, a picture is an icon, a rule or a logo.
MIN_IMAGE_PT = 48

#: And a taller floor on the height alone. The finish strips these
#: catalogues print across the top of a range — six 73x52pt chips reading
#: "Chrome / Black Chrome / Black Matt" — clear the square floor above
#: and are not products. Real product shots on the same page are 94pt
#: tall and up.
MIN_IMAGE_HEIGHT_PT = 60

#: Above this share of the page, it is a background or a full-bleed hero —
#: not a product shot with a caption under it.
MAX_PAGE_SHARE = 0.72

#: Boxes this close together are one photograph. Catalogues routinely
#: slice a single image into strips, and without this a drawer system
#: arrives as fourteen separate products.
MERGE_GAP_PT = 3

#: How far below a picture its caption can start, as a share of the
#: picture's own height. A caption sits tight under its image; anything
#: further down belongs to the next row or is page furniture.
CAPTION_BAND = 0.85

#: And a floor for it, for thumbnail-sized pictures whose caption is
#: taller than they are.
CAPTION_MIN_PT = 54

#: How far above a picture to look for the heading that names its series.
HEADING_REACH_PT = 320

#: Where a region holds no raster at all, the artwork is vector and has
#: no native resolution to preserve, so the only question is what is
#: worth storing. 600 is print quality.
VECTOR_DPI = 600

#: The floor under the adaptive DPI. A region whose images are drawn at
#: 40 DPI is a watermark behind the product, not the product.
MIN_RENDER_DPI = 96

#: And a ceiling on the rendered result, in pixels on the long side, so
#: that a 600 DPI vector page cannot ask for a 9,000 px crop.
MAX_RENDER_PX = 2000

#: How much of a box one embedded image must cover before the photograph
#: is taken from that image rather than rendered from the page. Below
#: this the box holds a product drawn from several objects — a body, a
#: spout, a shadow — and pulling one of them out loses the rest.
DOMINANT_COVERAGE = 0.92

#: And how much of the box everything else may cover before the same
#: thing is true.
DOMINANT_INTRUSION = 0.02

#: How much of a picture must be plain white ground before it can be a
#: product cut-out. A catalogue photographs its products on white and
#: its marketing on location, so a picture with no white field in it is
#: a room, a factory floor or an awards evening. Measured only where
#: nothing else identifies the picture — a code or a price outranks it,
#: because shower enclosures and modular drawers are genuinely
#: photographed in rooms.
MIN_WHITE_FIELD = 0.12

#: Under this, a "price" is a dimension that happened to be printed
#: beside the rupee sign: "H: 20 W: 1200 Rs" reads as ₹20. No fitting in
#: these catalogues costs less than a hundred rupees.
MIN_SENSIBLE_PRICE_PAISE = 100_00

#: More distinct product codes than this printed inside a picture's own
#: rectangle, and the rectangle is a printed row the merge step joined,
#: not one product. Importing it files a photograph of four taps under
#: one of their codes.
MAX_CODES_IN_PICTURE = 1

#: Thumbnail edge, in pixels, for the picture embedded in the sheet.
THUMB_PX = 96


# --- reading a caption ----------------------------------------------------

#: Rupees, written four ways. The catalogues set ₹ in a font where it
#: extracts as a backtick, which is why that is in here.
PRICE = re.compile(
    r"(?:₹|`|Rs\.?|INR|MRP[:.]?)\s*([\d][\d,]*(?:\.\d{1,2})?)",
    re.I,
)

#: A manufacturer's code, without knowing the manufacturer: upper-case,
#: no spaces, and either carrying a digit (FUP-CHR-29011BPM, 480050 —
#: a bare number needs five digits, because three or four is a dimension)
#: or hyphenated in a way prose is not. `is_code` judges that second
#: case; this pattern is only the shape.
CODE_SHAPE = re.compile(r"^(?:[A-Z][A-Z0-9./-]{2,23}|\d{5,12})$")

#: Word-like: a hyphenated pair of real words. "SOFT-CLOSE" is a feature
#: printed in the same capitals as a code and must not become a SKU.
WORDY_SEGMENT = re.compile(r"^[A-Z]{4,}$")


def is_code(token):
    """Whether a token is a product code rather than a word in capitals."""
    text = (token or "").strip(".,;:()")
    if not CODE_SHAPE.match(text):
        return False
    if any(c.isdigit() for c in text):
        return True

    # No digit anywhere: only a code if it is segmented like one. Three
    # or more segments, or a short segment prose would not produce —
    # OE-DWDS-PRO-S and OK-CT-N are codes, SOFT-CLOSE is not.
    segments = [seg for seg in re.split(r"[-./]", text) if seg]
    if len(segments) < 2:
        return False
    return len(segments) >= 3 or not all(WORDY_SEGMENT.match(s) for s in segments)


class _Code:
    """Keeps `CODE.match(...)` reading the way it did, now that the test
    is a function rather than one pattern."""

    @staticmethod
    def match(token):
        return is_code(token)

    @staticmethod
    def sub(replacement, text):
        return " ".join(
            replacement if is_code(t) else t for t in (text or "").split()
        )


CODE = _Code()

#: Page furniture that is never a product name or a series.
FURNITURE = re.compile(
    r"^(?:product\s*(?:code|image)|description|mrp|price|page|note|notes|www\.|"
    r"scan\s+for|key\s+features|specifications?|size\s*\(mm\)|"
    r"all\s+prices|terms|index|contents)\b",
    re.I,
)

#: Dimension and finish noise that makes a poor product name on its own.
MEASUREMENT = re.compile(r"^[\d\s.,x×/-]+(?:mm|cm|m|inch|in|ft|kg|g|l|ml)?$", re.I)


def to_paise(raw):
    """'3,600' -> 360000. Integer paise, never float rupees.

    Rounds a stray decimal to the nearest paisa rather than truncating,
    and refuses anything that is not a number.
    """
    if raw is None:
        return None
    cleaned = re.sub(r"[^\d.]", "", str(raw))
    if not cleaned or cleaned == ".":
        return None
    try:
        return int(round(float(cleaned) * 100))
    except ValueError:
        return None


def tidy(text):
    """Collapses whitespace and strips the doubled-letter print flash.

    Several of these catalogues overlay a "NNeeww" badge that extracts as
    doubled letters, and one sets its headings twice for a drop shadow.
    """
    out = re.sub(r"\b(?:NN?ee?ww?|New)\b", " ", text or "")
    out = re.sub(r"(.)\1{2,}", r"\1", out)
    # The same badge sometimes extracts a letter at a time — "N N e e w w".
    # Three or more single letters in a row is never prose.
    out = re.sub(r"(?:(?<=\s)|^)(?:[A-Za-z]\s+){2,}[A-Za-z](?=\s|$)", " ", out)
    out = re.sub(r"\s+", " ", out)
    return out.strip(" .,-|:;`")


def merge_boxes(boxes):
    """Unions picture boxes that touch, repeatedly until nothing changes.

    One pass is not enough: three strips of one photograph merge pairwise
    into two overlapping boxes, which then have to merge again.
    """
    rects = [
        {"x0": b["x0"], "x1": b["x1"], "top": b["top"], "bottom": b["bottom"]}
        for b in boxes
    ]

    changed = True
    while changed:
        changed = False
        out = []
        for rect in rects:
            for other in out:
                overlaps_x = (
                    rect["x0"] <= other["x1"] + MERGE_GAP_PT
                    and other["x0"] <= rect["x1"] + MERGE_GAP_PT
                )
                overlaps_y = (
                    rect["top"] <= other["bottom"] + MERGE_GAP_PT
                    and other["top"] <= rect["bottom"] + MERGE_GAP_PT
                )
                if overlaps_x and overlaps_y:
                    other["x0"] = min(other["x0"], rect["x0"])
                    other["x1"] = max(other["x1"], rect["x1"])
                    other["top"] = min(other["top"], rect["top"])
                    other["bottom"] = max(other["bottom"], rect["bottom"])
                    changed = True
                    break
            else:
                out.append(rect)
        rects = out

    return rects


def product_pictures(page):
    """The boxes on this page worth treating as product photography."""
    page_area = max(page.width * page.height, 1)

    candidates = [
        im
        for im in page.images
        if (im["x1"] - im["x0"]) >= MIN_IMAGE_PT
        and (im["bottom"] - im["top"]) >= MIN_IMAGE_PT
    ]

    merged = merge_boxes(candidates)
    return [
        box
        for box in merged
        if ((box["x1"] - box["x0"]) * (box["bottom"] - box["top"])) / page_area
        <= MAX_PAGE_SHARE
        and (box["x1"] - box["x0"]) >= MIN_IMAGE_PT
        and (box["bottom"] - box["top"]) >= MIN_IMAGE_HEIGHT_PT
    ]


def lines_of(words):
    """Groups words into printed lines, with the largest font size seen.

    Font size is what tells a heading from the prose around it, and it is
    a property of the line rather than of the page.
    """
    rows = {}
    for word in words:
        key = round(word["top"] / 3)
        rows.setdefault(key, []).append(word)

    lines = []
    for group in rows.values():
        ordered = sorted(group, key=lambda w: w["x0"])
        lines.append(
            {
                "text": " ".join(w["text"] for w in ordered),
                "top": min(w["top"] for w in ordered),
                "bottom": max(w["bottom"] for w in ordered),
                "x0": min(w["x0"] for w in ordered),
                "x1": max(w["x1"] for w in ordered),
                "size": max(w.get("size", 0) or 0 for w in ordered),
            }
        )

    return sorted(lines, key=lambda line: line["top"])


def caption_words(words, box, pictures):
    """The words captioning one picture: beneath it, above the next one.

    Horizontally a word belongs to the picture when its own centre falls
    within the picture's span, widened a little — a description is wider
    than the photograph it describes, and a code is often centred under
    an image that is narrower than the text.
    """
    height = box["bottom"] - box["top"]
    limit = box["bottom"] + max(height * CAPTION_BAND, CAPTION_MIN_PT)

    # A picture below this one ends the band early, whatever the limit says.
    for other in pictures:
        if other["top"] <= box["bottom"] + 1:
            continue
        horizontal = other["x0"] <= box["x1"] and box["x0"] <= other["x1"]
        if horizontal:
            limit = min(limit, other["top"])

    margin = max((box["x1"] - box["x0"]) * 0.35, 24)
    left, right = box["x0"] - margin, box["x1"] + margin

    inside = [
        w
        for w in words
        if box["bottom"] - 1 <= w["top"] < limit
        and left <= (w["x0"] + w["x1"]) / 2 <= right
    ]
    return sorted(inside, key=lambda w: (round(w["top"] / 3), w["x0"]))


def row_words(words, box, pictures):
    """The words printed to the right of a picture, on its own rows.

    Half these catalogues are tables rather than grids: Ozone prints
    `Product Code | Description | MRP` across a row with the photograph at
    its left edge, and a reader that only looks *underneath* an image
    finds the next row's heading. This is the other place a caption can
    be, used when the band below yields nothing.
    """
    top, bottom = box["top"] - 4, box["bottom"] + 4
    right = box["x1"]
    limit = box["x1"] + 1e6

    for other in pictures:
        if other["x0"] <= box["x1"] + 1:
            continue
        if other["top"] <= bottom and top <= other["bottom"]:
            limit = min(limit, other["x0"])

    inside = [
        w
        for w in words
        if top <= (w["top"] + w["bottom"]) / 2 <= bottom
        and right <= w["x0"] < limit
    ]
    return sorted(inside, key=lambda w: (round(w["top"] / 3), w["x0"]))


def heading_above(lines, box, body_size):
    """The nearest line above a picture that is set like a heading.

    Series names are printed once over a block of products — "FUSION
    PRIME" above nine taps — so they cannot come from the caption. A
    heading is either set larger than the page's body text or set in
    capitals, which is how these documents mark them.
    """
    best = None
    for line in lines:
        if line["bottom"] > box["top"] + 2:
            continue
        if box["top"] - line["bottom"] > HEADING_REACH_PT:
            continue

        text = tidy(line["text"])
        # A series is a name, not a sentence. Past this length the line is
        # a specification table's header row, which these catalogues also
        # set in capitals.
        if len(text) < 3 or len(text) > 48:
            continue
        if FURNITURE.match(text) or PRICE.search(text):
            continue
        # A line with a code in it is a price-list line, whatever its
        # font size says — three codes printed side by side above a grid
        # read as a heading otherwise, and the series becomes
        # "FUP-CHR-29011BPM FUP-CHR-29051BPM".
        if any(CODE.match(t.strip(".,;:()")) for t in text.split()):
            continue
        if CODE.match(text.replace(" ", "")) or MEASUREMENT.match(text):
            continue

        letters = [c for c in text if c.isalpha()]
        if len(letters) < 3:
            continue

        caps = sum(1 for c in letters if c.isupper()) / len(letters)
        larger = body_size and line["size"] > body_size * 1.12
        if not (larger or caps > 0.85):
            continue

        # Nearest wins, so keep overwriting as we come down the page.
        best = text

    return best


def parse_caption(words):
    """A code, a price and a name out of one picture's caption."""
    tokens = [w["text"] for w in words]
    text = " ".join(tokens)

    price_match = PRICE.search(text)
    price_paise = to_paise(price_match.group(1)) if price_match else None

    codes = [t for t in tokens if CODE.match(t.strip(".,;:()"))]
    code = codes[0].strip(".,;:()") if codes else None

    # The name is the caption with the code, the price and the furniture
    # taken out of it. Done line by line so that a line which is nothing
    # but a dimension can be dropped whole.
    name_lines = []
    for line in group_lines(words):
        # "500MM MG Size (mm) 430 x 485 x 50 (WxDxH)" — everything from
        # "Size" on is the dimension table, not part of any name.
        candidate = re.sub(r"\bsize\s*[:(].*$", "", line, flags=re.I)
        # "(WxDxH)" labels the axes of the figures beside it. Dropping
        # the label leaves "380 x 485 x 50", which MEASUREMENT then
        # recognises as a dimension and discards whole — the figures are
        # on their own printed line as often as not.
        candidate = re.sub(
            r"\(?\s*[WDHwdh](?:\s*[x×]\s*[WDHwdh])+\s*\)?", " ", candidate
        )
        for found in codes:
            candidate = candidate.replace(found, " ")
        candidate = PRICE.sub(" ", candidate)
        candidate = tidy(candidate)
        if not candidate or len(candidate) < 3:
            continue
        if FURNITURE.match(candidate) or MEASUREMENT.match(candidate):
            continue
        if sum(1 for c in candidate if c.isalpha()) < 3:
            continue
        name_lines.append(candidate)

    return code, price_paise, tidy(" ".join(name_lines[:3]))


#: A word set in sentence case — the thing a size-and-finish caption has
#: none of. "Front Connector" is a name; "500MM ANTHGREY" is not.
PROSE_WORD = re.compile(r"^[A-Z][a-z]{2,}$")


def looks_like_variant(text):
    """Whether a caption is a size and a finish rather than a name.

    Dense catalogues print the product name once, in the heading over a
    block, and give each row only its size: "500MM ANTHGREY". Imported as
    a name that is six products called "500MM ANTHGREY"; recognised for
    what it is, it is one product with six variants, which is what the
    page means.
    """
    tokens = [t for t in (text or "").split() if t]
    if not tokens or len(tokens) > 6:
        return False
    if any(PROSE_WORD.match(t) for t in tokens):
        return False
    return any(c.isdigit() for c in text)


def group_lines(words):
    """The caption's words back into the lines they were printed on."""
    rows = {}
    for word in words:
        rows.setdefault(round(word["top"] / 3), []).append(word)
    return [
        " ".join(w["text"] for w in sorted(group, key=lambda w: w["x0"]))
        for _, group in sorted(rows.items())
    ]


# --- rendering ------------------------------------------------------------


def to_fitz_box(fitz_page, box):
    """One pdfplumber box in PyMuPDF's coordinates.

    Both measure y downwards from the top, but from the top of a
    different rectangle: pdfplumber works in MediaBox coordinates and
    PyMuPDF in CropBox ones. Every page of the Hindware catalogue carries
    a CropBox inset 28.35pt (10mm) from its MediaBox, so comparing the
    two without this shift silently slides every box a third of an inch
    up and to the left — which still overlaps the right image, by less,
    and so reads as a product made of several objects rather than one.
    """
    origin = fitz_page.cropbox_position
    return {
        "x0": box["x0"] - origin.x,
        "top": box["top"] - origin.y,
        "x1": box["x1"] - origin.x,
        "bottom": box["bottom"] - origin.y,
    }


def overlapping_images(fitz_page, box):
    """Images drawn inside one box, with their overlap, largest first."""
    box = to_fitz_box(fitz_page, box)
    found = []
    for info in fitz_page.get_image_info(xrefs=True):
        x0, top, x1, bottom = info["bbox"]
        width = min(x1, box["x1"]) - max(x0, box["x0"])
        height = min(bottom, box["bottom"]) - max(top, box["top"])
        if width <= 0 or height <= 0:
            continue
        found.append((width * height, info))
    found.sort(key=lambda pair: -pair[0])
    return found


def dominant_image(fitz_page, box):
    """The one image that *is* this product, or None if it takes several.

    A product drawn as a single placed image can be taken from the PDF
    exactly as stored, which is better than rendering it: no
    interpolation, no page furniture, no resampling. A product drawn as
    several objects cannot — pulling the largest one out would drop the
    spout, the shadow or the second half of the fitting — so those are
    still rendered from the page.
    """
    area = (box["x1"] - box["x0"]) * (box["bottom"] - box["top"])
    if area <= 0:
        return None

    overlaps = overlapping_images(fitz_page, box)
    if not overlaps:
        return None

    covered, best = overlaps[0]
    if covered < DOMINANT_COVERAGE * area:
        return None
    intrusion = sum(part for part, _ in overlaps[1:])
    if intrusion > DOMINANT_INTRUSION * area:
        return None
    return best


def smask_of(fitz_page, xref):
    """The soft-mask xref for one image, or 0 where it carries none."""
    for row in fitz_page.get_images(full=True):
        if row[0] == xref:
            return row[1]
    return 0


def decode(doc, xref, mode="RGB"):
    """One image XObject decoded to a PIL image, CMYK converted to RGB."""
    pix = fitz.Pixmap(doc, xref)
    if pix.colorspace and pix.colorspace.n == 4:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert(mode)


def embedded_photograph(doc, fitz_page, xref):
    """One embedded image laid over white through its own soft mask.

    These catalogues silhouette their products: the colour lives in one
    stream and the transparency in a separate /SMask object. Decoding the
    colour stream alone — what "extract the embedded image" means in
    every library — gives the product on black. The mask has to be
    fetched by its own xref and applied, and it is allowed to be a
    different size from the image it masks.
    """
    try:
        base = decode(doc, xref)
    except Exception:
        return None

    mask_xref = smask_of(fitz_page, xref)
    if not mask_xref:
        return base
    try:
        mask = decode(doc, mask_xref, mode="L")
        if mask.size != base.size:
            mask = mask.resize(base.size, Image.LANCZOS)
        canvas = Image.new("RGB", base.size, "white")
        canvas.paste(base, mask=mask)
        return canvas
    except Exception:
        return base


def render_dpi_for(fitz_page, box):
    """The DPI to rasterise one box at: enough to keep what it holds.

    Per image drawn in the box, its native pixels over the inches it is
    drawn across. Rendering below the highest of those throws away detail
    the PDF genuinely holds; rendering above it only interpolates, which
    makes a larger file and not a better photograph. A box with no raster
    in it is vector, which has no native size, so it renders at
    VECTOR_DPI.

    Capped by MAX_RENDER_PX on the long side, so one absurd placement
    cannot ask for an enormous crop.
    """
    best = 0.0
    for _, info in overlapping_images(fitz_page, box):
        x0, top, x1, bottom = info["bbox"]
        for extent_pt, pixels in (
            (x1 - x0, info["width"]),
            (bottom - top, info["height"]),
        ):
            inches = extent_pt / 72
            if inches > 0:
                best = max(best, pixels / inches)

    dpi = max(best, MIN_RENDER_DPI) if best else VECTOR_DPI

    long_pt = max(box["x1"] - box["x0"], box["bottom"] - box["top"])
    if long_pt > 0:
        dpi = min(dpi, MAX_RENDER_PX / (long_pt / 72))
    return max(round(dpi), MIN_RENDER_DPI)


def codes_inside(words, box):
    """Distinct product codes printed within a picture's own rectangle.

    Zero or one is a product. More is a row of them: the merge step joins
    boxes 3pt apart, which on a dense grid page walks a whole printed row
    into a single rectangle, and the caption parser then files that
    rectangle under whichever code it read first.
    """
    found = set()
    for word in words:
        middle_x = (word["x0"] + word["x1"]) / 2
        middle_y = (word["top"] + word["bottom"]) / 2
        if not (box["x0"] <= middle_x <= box["x1"]):
            continue
        if not (box["top"] <= middle_y <= box["bottom"]):
            continue
        token = word["text"].strip(".,;:()")
        if is_code(token):
            found.add(token)
    return found


def trim_to_artwork(box, words):
    """Pulls the crop past page text overlapping the picture's edges.

    An image box frequently runs under the heading above it or the code
    beneath it, and rendering it verbatim bakes that text into the
    product photograph. Only the edges are trimmed: text crossing the
    middle of a product is part of the artwork.
    """
    top, bottom = box["top"], box["bottom"]
    height = bottom - top
    if height <= 0:
        return top, bottom

    edge = height * 0.28
    for word in words:
        if word["x1"] <= box["x0"] or word["x0"] >= box["x1"]:
            continue
        if word["bottom"] <= top or word["top"] >= bottom:
            continue
        if word["bottom"] <= top + edge:
            top = max(top, word["bottom"] + 1)
        elif word["top"] >= bottom - edge:
            bottom = min(bottom, word["top"] - 1)

    return (top, bottom) if bottom - top > height * 0.4 else (box["top"], box["bottom"])


def white_field_share(img):
    """How much of a picture is plain white ground.

    Near-white and unsaturated, so a pale wall or a cream worktop does
    not pass as studio white. Sampled from a thumbnail: this is a
    question about the composition, not about the pixels, and measuring
    it full size on two thousand images is wasted work.

    Deliberately not the border ring that `audit-photo-backgrounds.ts`
    uses. The ring answers "would this look like a cutout in a disc",
    which is a different question: a black seat cover or a bronze tap
    cropped tight to its artwork fails the ring test and is still a
    product photographed on white.
    """
    sample = img.convert("RGB")
    sample.thumbnail((160, 160))
    pixels = numpy_array(sample)
    light = pixels.min(axis=2) >= 238
    flat = (pixels.max(axis=2) - pixels.min(axis=2)) <= 12
    return float((light & flat).mean())


def numpy_array(img):
    """NumPy is imported here so the script still runs without it."""
    import numpy as np

    return np.asarray(img, dtype=np.int16)


def photograph_of(page, fitz_page, doc, box, words=()):
    """The best available picture of one product box, and how it was got.

    Two routes, and the first one is preferred wherever it applies:

    1. The product is one placed image. Then the PDF already holds the
       photograph, and it is taken out as stored and composited over
       white through its own soft mask. Nothing is resampled.
    2. The product is several objects, or vector. Then it is rasterised
       from the page at the DPI the page's own images hold — measured,
       not a constant. Rendering below that loses detail; above it only
       interpolates, which is how a 100 DPI catalogue used to come out
       as 200 DPI files that were twice the size and no sharper.

    Returns (image, route), or (None, None) where the crop fails. The
    picture is handed back rather than written, so that the caller can
    look at it before deciding it is a product at all.
    """
    rendered, route = None, None

    best = dominant_image(fitz_page, box)
    if best is not None:
        rendered = embedded_photograph(doc, fitz_page, best["xref"])
        if rendered is not None:
            route = "embedded"

    if rendered is None:
        top, bottom = trim_to_artwork(box, words)
        try:
            crop = page.crop((box["x0"], top, box["x1"], bottom))
            rendered = crop.to_image(
                resolution=render_dpi_for(fitz_page, box)
            ).original
        except Exception:
            return None, None
        route = "rendered"

    if rendered.mode in ("RGBA", "LA", "P"):
        rendered = rendered.convert("RGBA")
        canvas = Image.new("RGB", rendered.size, "white")
        canvas.paste(rendered, mask=rendered.split()[-1])
        rendered = canvas
    else:
        rendered = rendered.convert("RGB")

    return rendered, route


def save_image(rendered, route, stem, images_dir, thumbs_dir, seen):
    """Writes one picture to JPEG plus a thumbnail, deduplicating by content."""
    buffer = io.BytesIO()
    rendered.save(buffer, "JPEG", quality=85, optimize=True)
    data = buffer.getvalue()

    digest = hashlib.md5(data).hexdigest()
    if digest in seen:
        return seen[digest]

    name = f"{re.sub(r'[^A-Za-z0-9._-]', '_', stem)[:60]}.jpg"
    if (images_dir / name).exists():
        name = f"{name[:-4]}-{digest[:6]}.jpg"
    (images_dir / name).write_bytes(data)

    thumb = rendered.copy()
    thumb.thumbnail((THUMB_PX, THUMB_PX))
    thumb_name = name
    thumb.save(thumbs_dir / thumb_name, "JPEG", quality=80)

    seen[digest] = (name, thumb_name, route)
    return name, thumb_name, route


# --- one PDF --------------------------------------------------------------


def guess_brand(pdf, pdf_path, known):
    """Names the brand from the document itself, or returns None.

    Checked against the brands the catalogue already carries, because a
    guess that invents a brand name creates a duplicate the storefront
    then shows twice ("Dr Fixit" and "Dr. Fixit" were exactly this).

    Counted rather than first-match, and the count is the whole point:
    the catalogue's own brand is printed on every page, while another
    brand appears once in a compatibility note. A single mention decides
    nothing — this returned "India" for an Ozone catalogue when it took
    the first name it found. The filename carries the most weight, since
    a dealer names the file after the brand more reliably than a cover
    page spells it.
    """
    pages = " ".join((page.extract_text() or "") for page in pdf.pages[:6])
    metadata = " ".join(str(v) for v in (pdf.metadata or {}).values())

    scores = {}
    for brand in known:
        pattern = re.compile(rf"(?<![A-Za-z]){re.escape(brand)}(?![A-Za-z])", re.I)
        score = (
            5 * len(pattern.findall(pdf_path.stem))
            + 2 * len(pattern.findall(metadata))
            + len(pattern.findall(pages))
        )
        if score:
            scores[brand] = score

    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], -len(kv[0])))
    if not ranked:
        return None

    winner, score = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0

    # Two mentions at least, and a clear lead over the next name.
    if score < 2 or score < runner_up * 1.5:
        return None
    return winner


def page_range(spec, total):
    """'1-40' or '5' or None -> the page numbers to read."""
    if not spec:
        return range(1, total + 1)
    if "-" in spec:
        first, last = spec.split("-", 1)
        return range(max(1, int(first)), min(total, int(last)) + 1)
    return range(int(spec), min(total, int(spec)) + 1)


def is_identified(code, price_paise, name):
    """Whether a picture is a product at all, rather than page furniture.

    A banner photograph at the top of a range page has no code, no price
    and no caption; so does a lifestyle shot. Something with none of the
    three is not a product this tool can describe, and putting it in the
    sheet asks a human to delete rows rather than price them. Two words
    of caption is enough to keep it — a specification catalogue carries
    no prices at all and its photographs are still worth having.
    """
    if code or price_paise:
        return True
    return len([w for w in (name or "").split() if any(c.isalpha() for c in w)]) >= 3


def extract_pdf(pdf_path, brand, out_dir, pages_spec, known_brands, keep_all=False):
    """Every product-shaped picture in one PDF, with what its page says."""
    images_dir = out_dir / "images"
    thumbs_dir = out_dir / "thumbs"
    images_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    seen = {}
    unidentified = 0
    crowded = 0
    marketing = 0
    routes = {"embedded": 0, "rendered": 0}

    fitz_doc = fitz.open(pdf_path)
    with pdfplumber.open(pdf_path) as pdf:
        if not brand:
            brand = guess_brand(pdf, pdf_path, known_brands)
            if brand:
                print(f"  brand read from the document: {brand}")
            else:
                brand = "UNKNOWN"
                print(
                    "  brand could not be read from the document — rows are "
                    "marked UNKNOWN and must be corrected in the sheet, or "
                    "re-run with --brand"
                )

        wanted = page_range(pages_spec, len(pdf.pages))

        for page_no in wanted:
            page = pdf.pages[page_no - 1]
            try:
                words = page.extract_words(extra_attrs=["size"])
            except Exception:
                words = page.extract_words()

            pictures = product_pictures(page)
            if not pictures:
                continue

            lines = lines_of(words)
            sizes = [w.get("size", 0) or 0 for w in words]
            body_size = statistics.median(sizes) if sizes else 0

            for index, box in enumerate(
                sorted(pictures, key=lambda b: (round(b["top"]), b["x0"]))
            ):
                # A rectangle with several product codes printed inside it
                # is a printed row the merge step joined, not a product.
                # Whatever is cropped out of it is a photograph of other
                # products as much as of this one, and it would arrive in
                # the sheet looking perfectly reasonable.
                if len(codes_inside(words, box)) > MAX_CODES_IN_PICTURE:
                    crowded += 1
                    continue

                caption = caption_words(words, box, pictures)
                code, price_paise, name = parse_caption(caption)

                # Nothing underneath: this is a table, so look along the row.
                if not code and price_paise is None:
                    beside = row_words(words, box, pictures)
                    if beside:
                        code, price_paise, name = parse_caption(beside) or (
                            code,
                            price_paise,
                            name,
                        )

                # "H: 20 W: 1200 Rs" is a dimension table, not a price.
                dimension_price = None
                if price_paise is not None and price_paise < MIN_SENSIBLE_PRICE_PAISE:
                    dimension_price = price_paise
                    price_paise = None

                series = heading_above(lines, box, body_size)

                if not keep_all and not is_identified(code, price_paise, name):
                    unidentified += 1
                    continue

                variant = ""
                if series and looks_like_variant(name):
                    variant, name = name, series

                notes = []
                printed_code = bool(code)
                if not code:
                    code = f"P{page_no:04d}-{index + 1:02d}"
                    notes.append("no code on the page — placeholder, replace it")
                if not name:
                    name = series or ""
                    notes.append(
                        "no caption text — name taken from the heading"
                        if series
                        else "no caption text — name it by hand"
                    )
                if price_paise is None:
                    notes.append("no price printed beside this picture")
                if dimension_price is not None:
                    notes.append(
                        f"a price of Rs{dimension_price / 100:,.0f} was printed "
                        "here and dropped as a dimension — check the catalogue"
                    )

                rendered, route = photograph_of(
                    page, fitz_doc[page_no - 1], fitz_doc, box, words
                )
                if rendered is None:
                    continue

                # Nothing printed identifies this picture, and there is no
                # white ground in it: an awards evening, a factory floor,
                # a bathroom shot on location. A code or a price outranks
                # the test, because shower enclosures and modular drawers
                # are photographed in rooms and are still products.
                if (
                    not printed_code
                    and price_paise is None
                    and white_field_share(rendered) < MIN_WHITE_FIELD
                ):
                    marketing += 1
                    continue

                image_name, thumb_name, route = save_image(
                    rendered, route, f"{code}", images_dir, thumbs_dir, seen
                )
                if not image_name:
                    continue
                routes[route] = routes.get(route, 0) + 1

                rows.append(
                    {
                        "brand": brand,
                        "photography": route,
                        "series": series or "",
                        "name": name,
                        "variant": variant,
                        "code": code,
                        "cataloguePricePaise": price_paise,
                        "page": page_no,
                        "image": image_name,
                        "thumb": thumb_name,
                        "source": pdf_path.name,
                        "notes": "; ".join(notes),
                    }
                )

            if page_no % 25 == 0:
                print(f"  page {page_no}: {len(rows)} pictures so far", flush=True)

    fitz_doc.close()

    if unidentified:
        print(
            f"  {unidentified} picture(s) skipped with no code, no price and "
            "no caption — banners and lifestyle shots. --keep-all keeps them."
        )
    if crowded:
        print(
            f"  {crowded} picture(s) skipped holding more than "
            f"{MAX_CODES_IN_PICTURE} product code — a printed row joined into "
            "one rectangle, not one product."
        )
    if marketing:
        print(
            f"  {marketing} picture(s) skipped as marketing — no code, no "
            "price and no white ground: lifestyle, factory and awards shots."
        )
    if routes["embedded"] or routes["rendered"]:
        print(
            f"  photography: {routes['embedded']} taken from the PDF's own "
            f"embedded image, {routes['rendered']} rendered from the page"
        )

    return brand, rows


def dedupe(rows):
    """One row per picture per brand.

    A catalogue repeats a photograph — the same tap on its range page and
    again in the price list — and `save_image` already collapses those to
    one file. Two rows pointing at one file would import as two products
    with the same photograph, so the better-described one wins: a row
    that found a real code and a price says more than one that found
    neither.
    """
    best = {}
    for row in rows:
        key = (row["brand"], row["image"])
        score = (
            bool(row["cataloguePricePaise"]),
            not row["code"].startswith("P0"),
            bool(row["name"]),
            bool(row.get("variant")),
            len(row["name"]),
        )
        if key not in best or score > best[key][0]:
            best[key] = (score, row)
    return [row for _, row in best.values()]


# --- the workbook ---------------------------------------------------------

HEADERS = [
    ("Sell?", 7),
    ("Picture", 14),
    ("Product name", 46),
    ("Series", 22),
    ("Code", 20),
    ("Variant / size", 18),
    ("Category", 26),
    ("Unit", 14),
    ("GST %", 7),
    ("Catalogue price (₹)", 17),
    ("Your price (₹)", 15),
    ("Page", 6),
    ("Image file", 26),
    ("Notes", 40),
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

HOW_IT_WORKS = [
    ("What this is", True),
    ("", False),
    (
        "One row per photograph found in the supplier PDFs, with whatever the "
        "page printed beside it. Nothing here is on the website yet.",
        False,
    ),
    ("", False),
    ("What to do", True),
    ("", False),
    (
        "1. Go through each brand's sheet. Highlight the rows you want to "
        "sell — any fill colour on the row will do — or put an x in the "
        "Sell? column.",
        False,
    ),
    (
        "2. Fill in Your price (₹) for those rows. This is what the customer "
        "pays, GST included. It is deliberately empty: the catalogue's own "
        "MRP is next to it for reference only.",
        False,
    ),
    (
        "3. Correct anything the extraction got wrong — a name, a code, a "
        "category. The Notes column says where it was unsure.",
        False,
    ),
    (
        "4. Save the file and tell Claude: upload them to the website.",
        False,
    ),
    ("", False),
    ("Rules the import follows", True),
    ("", False),
    (
        "A highlighted row with no Your price is not imported. A price is a "
        "decision, and guessing one is how a customer gets charged the wrong "
        "amount.",
        False,
    ),
    (
        "Category must be one of the storefront's own categories — pick from "
        "the dropdown. A row with none is imported but will not appear in "
        "browse.",
        False,
    ),
    (
        "Catalogue price becomes the MRP shown struck through; Your price is "
        "what is charged. Both are GST-inclusive.",
        False,
    ),
    (
        "Rows are matched on Code, so re-importing an edited sheet updates "
        "those products rather than duplicating them.",
        False,
    ),
    (
        "Nothing is imported as an 18-minute item and no stock is claimed: "
        "every product arrives as scheduled delivery, which is the honest "
        "state until a dark store actually holds it.",
        False,
    ),
]


def write_workbook(path, by_brand, out_dir, categories, pdf_names):
    """One sheet per brand, a thumbnail per row, prices left to a human."""
    from openpyxl import Workbook
    from openpyxl.drawing.image import Image as XLImage
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    book = Workbook()

    guide = book.active
    guide.title = "How to use this"
    guide.column_dimensions["A"].width = 100
    for text, is_heading in HOW_IT_WORKS:
        cell = guide.cell(row=guide.max_row + 1, column=1, value=text)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        if is_heading:
            cell.font = Font(bold=True, size=12)
    guide.cell(
        row=guide.max_row + 2,
        column=1,
        value="Read from: " + ", ".join(pdf_names),
    ).alignment = Alignment(wrap_text=True)
    for brand, rows in sorted(by_brand.items()):
        priced = len([r for r in rows if r["cataloguePricePaise"]])
        guide.cell(
            row=guide.max_row + 1,
            column=1,
            value=f"{brand}: {len(rows)} pictures, {priced} with a printed price",
        )

    # Dropdown sources, kept on their own sheet: an inline list is capped
    # at 255 characters and the category names alone are longer than that.
    lists = book.create_sheet("Lists")
    for i, name in enumerate(categories, start=1):
        lists.cell(row=i, column=1, value=name)
    for i, unit in enumerate(UNITS, start=1):
        lists.cell(row=i, column=2, value=unit)
    lists.sheet_state = "hidden"

    header_fill = PatternFill("solid", fgColor="1F2A37")
    header_font = Font(bold=True, color="FFFFFF")

    for brand, rows in sorted(by_brand.items()):
        title = re.sub(r"[\\/*?:\[\]]", "-", brand)[:31] or "Brand"
        sheet = book.create_sheet(title)

        for column, (label, width) in enumerate(HEADERS, start=1):
            cell = sheet.cell(row=1, column=column, value=label)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            sheet.column_dimensions[get_column_letter(column)].width = width
        sheet.row_dimensions[1].height = 28
        # Freeze the header row only. Freezing columns as well (the old
        # "C2") put the Picture column inside the frozen pane, and Excel
        # for Mac does not paint floating pictures there: every thumbnail
        # was in the file and none of them were drawn.
        sheet.freeze_panes = "A2"

        column_of = {label: i for i, (label, _) in enumerate(HEADERS, start=1)}

        for offset, row in enumerate(
            sorted(rows, key=lambda r: (r["page"], r["code"])), start=2
        ):
            sheet.row_dimensions[offset].height = 74

            sheet.cell(row=offset, column=column_of["Product name"], value=row["name"])
            sheet.cell(row=offset, column=column_of["Series"], value=row["series"])
            sheet.cell(row=offset, column=column_of["Code"], value=row["code"])
            sheet.cell(
                row=offset,
                column=column_of["Variant / size"],
                value=row.get("variant", ""),
            )
            sheet.cell(row=offset, column=column_of["Unit"], value="per piece")
            sheet.cell(row=offset, column=column_of["GST %"], value=18)
            if row["cataloguePricePaise"]:
                money = sheet.cell(
                    row=offset,
                    column=column_of["Catalogue price (₹)"],
                    value=row["cataloguePricePaise"] / 100,
                )
                money.number_format = "#,##0.00"
            sheet.cell(
                row=offset, column=column_of["Your price (₹)"]
            ).number_format = "#,##0.00"
            sheet.cell(row=offset, column=column_of["Page"], value=row["page"])
            sheet.cell(
                row=offset, column=column_of["Image file"], value=row["image"]
            )
            sheet.cell(row=offset, column=column_of["Notes"], value=row["notes"])

            for label in ("Product name", "Series", "Notes"):
                sheet.cell(row=offset, column=column_of[label]).alignment = Alignment(
                    wrap_text=True, vertical="center"
                )

            thumb = out_dir / "thumbs" / row["thumb"]
            if thumb.exists():
                picture = XLImage(str(thumb))
                picture.anchor = (
                    f"{get_column_letter(column_of['Picture'])}{offset}"
                )
                sheet.add_image(picture)

        last = max(sheet.max_row, 2)
        if categories:
            validation = DataValidation(
                type="list",
                formula1=f"=Lists!$A$1:$A${len(categories)}",
                allow_blank=True,
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

    book.save(path)


# --- entry point ----------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Supplier PDFs -> one reviewable product spreadsheet."
    )
    parser.add_argument("out_dir", help="where images, thumbs and the .xlsx go")
    parser.add_argument("pdfs", nargs="+", help="the catalogue PDFs")
    parser.add_argument(
        "--brand",
        action="append",
        default=[],
        help="brand for each PDF, in the same order; repeat the flag",
    )
    parser.add_argument(
        "--categories",
        help="JSON array of storefront category names, for the dropdown",
    )
    parser.add_argument("--pages", help="limit to a page range, e.g. 1-40")
    parser.add_argument(
        "--keep-all",
        action="store_true",
        help="keep pictures with no code, price or caption (banners too)",
    )
    parser.add_argument(
        "--name", default="catalogue-extract", help="stem for the .xlsx"
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    categories = []
    known_brands = []
    if args.categories:
        loaded = json.loads(Path(args.categories).read_text())
        if isinstance(loaded, dict):
            categories = list(loaded.get("categories", []))
            known_brands = list(loaded.get("brands", []))
        else:
            categories = list(loaded)

    if args.brand and len(args.brand) not in (0, len(args.pdfs)):
        sys.exit(
            f"{len(args.brand)} --brand flag(s) for {len(args.pdfs)} PDF(s): "
            "pass one per PDF, in the same order, or none at all"
        )

    by_brand = {}
    all_rows = []
    for index, raw in enumerate(args.pdfs):
        pdf_path = Path(raw)
        if not pdf_path.exists():
            sys.exit(f"no such file: {pdf_path}")

        brand = args.brand[index] if args.brand else None
        print(f"reading {pdf_path.name}")
        brand, rows = extract_pdf(
            pdf_path, brand, out_dir, args.pages, known_brands, args.keep_all
        )
        print(f"  {len(rows)} pictures with captions")
        all_rows.extend(rows)

    for row in dedupe(all_rows):
        by_brand.setdefault(row["brand"], []).append(row)

    manifest = out_dir / f"{args.name}.json"
    manifest.write_text(
        json.dumps(
            {
                "sources": [Path(p).name for p in args.pdfs],
                "rows": [r for rows in by_brand.values() for r in rows],
            },
            indent=1,
            ensure_ascii=False,
        )
    )

    workbook = out_dir / f"{args.name}.xlsx"
    write_workbook(
        workbook, by_brand, out_dir, categories, [Path(p).name for p in args.pdfs]
    )

    print()
    for brand, rows in sorted(by_brand.items()):
        priced = len([r for r in rows if r["cataloguePricePaise"]])
        coded = len([r for r in rows if not r["code"].startswith("P0")])
        print(
            f"{brand}: {len(rows)} products · {coded} with a real code · "
            f"{priced} with a printed price"
        )
    print(f"\nworkbook: {workbook}")
    print(f"manifest: {manifest}")


if __name__ == "__main__":
    main()
