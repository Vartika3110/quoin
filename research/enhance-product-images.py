"""Grade and improve catalogue photography, locally and for nothing.

No API, no account, no credits: PyMuPDF, OpenCV, Pillow and NumPy, all
on the CPU. The expensive half of a product-image pipeline is deciding
*which* pictures need work and refusing to touch the rest, and that half
costs nothing at all.

    .venv/bin/python research/enhance-product-images.py \
        --index public/catalogue-preview/hindware-a/index.json \
        --originals ~/Desktop/Catalogue-A-extracted/images \
        --out /tmp/enhanced --limit 10 --match "health faucet,bottle trap"

    .venv/bin/python research/enhance-product-images.py \
        --files a.png b.png --out /tmp/enhanced

What it does to a picture, in order, and nothing else:

  1. composites the PDF's separate alpha stream onto white, because a
     browser cannot pair two streams the way a PDF viewer does;
  2. trims to the artwork's own bounding box;
  3. grades it — GOOD, LOW_RESOLUTION, BLURRY, INVALID, MANUAL_REVIEW;
  4. **only if the grade calls for it**, denoises, upscales and sharpens;
  5. centres it on a 1000x1000 pure-white canvas and writes WebP.

**Colour and finish are never touched.** Sharpening runs on the L channel
of LAB and the a/b channels are passed through untouched, so a brushed-
gold faucet comes out the same gold it went in as. This is not a detail:
half this catalogue is metallic finishes, and the one unforgivable
failure is shipping a customer a picture of a different finish.

**The original is never written to.** Every output is a new file beside a
sidecar JSON recording where it came from, what grade it got and what was
done to it.

**Nothing is invented.** The upscaler here is Lanczos plus an unsharp
mask: it makes a small picture bigger and crisper, and it cannot add a
thread or an edge that was not photographed. A local Real-ESRGAN is
supported when its weights are present (--esrgan), and everything it
produces goes through the same fidelity gate as everything else —
measured against the original, and sent to MANUAL_REVIEW when it
diverges. A model that redraws a product is a model whose output does not
match the original, and that is a measurable thing, not a matter of
taste.
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# --- the standard every published picture is held to --------------------

#: Final canvas. Square, because ProductCard renders aspect-square.
CANVAS = 1000

#: Share of the canvas left empty around the product, per side.
PADDING = 0.12

#: What a product has to measure, on its long side, to be called GOOD.
#: A card renders at 300 CSS px, which is 600 real pixels on a retina
#: screen; below that a listing looks second-hand.
GOOD_LONG_SIDE = 600

#: Below this a picture is not a product at all.
MIN_USABLE_PX = 24

#: Laplacian variance under this, at a usable size, means soft focus or a
#: picture that has already been upscaled by somebody else.
BLUR_VARIANCE = 60.0

#: How far an enhanced picture may drift from the original before it is
#: held back for a person. 1.0 is identical; this is deliberately strict
#: because the failure it guards against — a plausible but different
#: product — is invisible to anyone who has not seen the original.
FIDELITY_FLOOR = 0.92

#: And how far the product's own colour may move, in LAB a/b units.
#: Roughly a just-noticeable difference; chrome drifting to brass is an
#: order of magnitude more than this.
CHROMA_DRIFT_CEILING = 3.0


# --- grading --------------------------------------------------------------


def sharpness(bgr):
    """Variance of the Laplacian: the standard cheap focus measure."""
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(grey, cv2.CV_64F).var())


def background_is_plain(bgr, ring=0.06):
    """Whether the border ring is near-uniform and light.

    A product shot on studio white can be put on a white canvas without
    anybody noticing the join. A photograph taken in a *room* cannot: the
    dish drainer brings its worktop with it, and padding that with white
    makes a collage, not a catalogue. Same test as
    `scripts/audit-photo-backgrounds.ts`, which already decides this for
    the storefront's sidebar.
    """
    h, w = bgr.shape[:2]
    band_y = max(1, int(h * ring))
    band_x = max(1, int(w * ring))
    border = np.concatenate(
        [
            bgr[:band_y].reshape(-1, 3),
            bgr[-band_y:].reshape(-1, 3),
            bgr[:, :band_x].reshape(-1, 3),
            bgr[:, -band_x:].reshape(-1, 3),
        ]
    )
    mean = border.mean(axis=0)
    spread = float(border.std(axis=0).mean())
    return bool(mean.min() > 200 and spread < 18), float(mean.mean()), spread


def artwork_mask(bgr):
    """Where the product is, as against the light ground around it."""
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(grey, (3, 3), 0)
    # Anything meaningfully darker than paper white is artwork. A fixed
    # threshold rather than Otsu: Otsu splits a picture that is *all*
    # product into light product and dark product.
    mask = (blurred < 243).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return mask


def count_products(mask, min_share=0.02):
    """How many separate objects are on this canvas.

    A catalogue prints a tap and its spare washers in one picture, and a
    range of four sizes in another. Those cannot be filed against one SKU
    without a person looking, so they are counted and flagged rather than
    guessed at. Specks below `min_share` of the artwork are not objects.
    """
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return 0
    areas = sorted(stats[1:, cv2.CC_STAT_AREA], reverse=True)
    if not areas:
        return 0
    biggest = areas[0]
    return 1 + sum(1 for a in areas[1:] if a >= biggest * min_share)


def touches_edge(mask, margin=2):
    """Whether the artwork runs off the frame — i.e. it was cropped."""
    h, w = mask.shape
    edges = [
        mask[:margin].any(),
        mask[-margin:].any(),
        mask[:, :margin].any(),
        mask[:, -margin:].any(),
    ]
    return bool(sum(bool(e) for e in edges) >= 2)


def grade(full, mask, trimmed, had_alpha):
    """One of the five statuses, with the measurements behind it.

    Size and focus are judged on the trimmed artwork, because that is
    what a customer actually sees once it is framed. Background and
    cropping are judged on the full canvas, because that is where the
    background still exists.
    """
    h, w = trimmed.shape[:2]
    facts = {"width": w, "height": h, "longSide": max(w, h), "shortSide": min(w, h)}

    if min(w, h) < MIN_USABLE_PX:
        facts["reason"] = f"{w}x{h} is too small to be a product"
        return "INVALID", facts

    ink = float((mask > 0).mean())
    facts["artworkShare"] = round(ink, 4)
    if ink < 0.005:
        facts["reason"] = "blank — no artwork found"
        return "INVALID", facts

    # A PDF alpha channel settles the background question outright: the
    # ground was transparent and is now the white we put behind it.
    if had_alpha:
        plain, mean_level, spread = True, 255.0, 0.0
    else:
        plain, mean_level, spread = background_is_plain(full)
    facts["hadAlpha"] = had_alpha
    facts["backgroundPlain"] = plain
    facts["backgroundLevel"] = round(mean_level, 1)
    facts["backgroundSpread"] = round(spread, 1)

    facts["sharpness"] = round(sharpness(trimmed), 1)
    objects = count_products(mask)
    facts["objects"] = objects
    facts["cropped"] = touches_edge(mask)

    if ink > 0.98:
        facts["reason"] = "no background — a full-bleed image, not a cut-out"
        return "MANUAL_REVIEW", facts
    if objects > 1:
        facts["reason"] = f"{objects} separate objects — one SKU or several?"
        return "MANUAL_REVIEW", facts
    if facts["cropped"]:
        facts["reason"] = "artwork runs off the frame on two or more sides"
        return "MANUAL_REVIEW", facts
    if not plain:
        facts["reason"] = "not shot on a plain light ground — cannot be put on white"
        return "MANUAL_REVIEW", facts

    if facts["longSide"] < GOOD_LONG_SIDE:
        facts["reason"] = f"long side {facts['longSide']}px, want {GOOD_LONG_SIDE}px"
        return "LOW_RESOLUTION", facts
    if facts["sharpness"] < BLUR_VARIANCE:
        facts["reason"] = f"laplacian variance {facts['sharpness']}, want {BLUR_VARIANCE}"
        return "BLURRY", facts

    return "GOOD", facts


# --- enhancement ----------------------------------------------------------


def denoise(bgr, strength=3):
    """Takes JPEG mosquito noise off, gently.

    These pictures are 100 DPI JPEGs inside a PDF; the ringing around a
    chrome edge is compression, not the product. Strength is kept low —
    non-local means at full strength turns a brushed finish into plastic.
    """
    return cv2.fastNlMeansDenoisingColored(bgr, None, strength, strength, 7, 21)


def upscale_lanczos(bgr, factor):
    """Resampling, not invention.

    Lanczos is the best of the classical kernels for photographic
    upsampling and it cannot add detail that was not there — which is
    exactly the property this catalogue needs. It makes the picture
    bigger and slightly soft; the unsharp pass below answers that.
    """
    h, w = bgr.shape[:2]
    return cv2.resize(
        bgr, (int(round(w * factor)), int(round(h * factor))), interpolation=cv2.INTER_LANCZOS4
    )


def sharpen_luma(bgr, amount=0.55, radius=1.4):
    """Unsharp mask on lightness only, so colour cannot move.

    The whole point. Sharpening the RGB channels independently pulls them
    apart at every edge, which on a gold tap reads as a colour fringe and
    on a chrome one as a tint. Converting to LAB, sharpening L and
    putting a and b back untouched makes a colour shift arithmetically
    impossible rather than merely unlikely.
    """
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    lightness, a, b = cv2.split(lab)

    blurred = cv2.GaussianBlur(lightness, (0, 0), radius)
    sharp = cv2.addWeighted(lightness, 1 + amount, blurred, -amount, 0)

    return cv2.cvtColor(cv2.merge([sharp, a, b]), cv2.COLOR_LAB2BGR)


def clean_background(bgr, floor=247):
    """Pulls a near-white ground to pure white, leaving the product alone.

    Only the pixels already within a few levels of white move, and only
    where they connect to the border — an interior highlight on chrome is
    part of the product and stays exactly as photographed.
    """
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    near_white = (grey >= floor).astype(np.uint8)

    # Flood from the border so that a white reflection inside the product
    # is not mistaken for background.
    h, w = near_white.shape
    flood = np.zeros((h + 2, w + 2), np.uint8)
    seed = near_white.copy()
    for x in range(0, w, max(1, w // 32)):
        for y in (0, h - 1):
            if seed[y, x]:
                cv2.floodFill(seed, flood, (x, y), 2)
    for y in range(0, h, max(1, h // 32)):
        for x in (0, w - 1):
            if seed[y, x]:
                cv2.floodFill(seed, flood, (x, y), 2)

    out = bgr.copy()
    out[seed == 2] = (255, 255, 255)
    return out


def esrgan_upscale(bgr, binary, model_dir, scale):
    """Real-ESRGAN through the ncnn binary, when one has been installed.

    Deliberately shelling out to `realesrgan-ncnn-vulkan` rather than
    importing torch: the binary is about 25 MB with its weights and uses
    the Metal driver this Mac already has, where a torch install is
    gigabytes to do the same arithmetic. Absent, everything falls back to
    Lanczos and says so.
    """
    import subprocess
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "in.png")
        dst = os.path.join(tmp, "out.png")
        cv2.imwrite(src, bgr)
        cmd = [binary, "-i", src, "-o", dst, "-s", str(scale), "-n", "realesrgan-x4plus"]
        if model_dir:
            cmd += ["-m", model_dir]
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        out = cv2.imread(dst, cv2.IMREAD_COLOR)
    if out is None:
        raise RuntimeError("realesrgan produced nothing")
    return out


# --- the fidelity gate ----------------------------------------------------


def ssim(a, b):
    """Structural similarity between two single-channel images.

    Written out rather than pulling in scikit-image for one function.
    Gaussian-weighted, the usual constants, mean over the map.
    """
    a = a.astype(np.float64)
    b = b.astype(np.float64)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2

    mu_a = cv2.GaussianBlur(a, (11, 11), 1.5)
    mu_b = cv2.GaussianBlur(b, (11, 11), 1.5)
    mu_a2, mu_b2, mu_ab = mu_a * mu_a, mu_b * mu_b, mu_a * mu_b

    sigma_a2 = cv2.GaussianBlur(a * a, (11, 11), 1.5) - mu_a2
    sigma_b2 = cv2.GaussianBlur(b * b, (11, 11), 1.5) - mu_b2
    sigma_ab = cv2.GaussianBlur(a * b, (11, 11), 1.5) - mu_ab

    numerator = (2 * mu_ab + c1) * (2 * sigma_ab + c2)
    denominator = (mu_a2 + mu_b2 + c1) * (sigma_a2 + sigma_b2 + c2)
    return float(np.mean(numerator / denominator))


def fidelity(original_bgr, enhanced_bgr):
    """How far the enhanced picture has moved from the original.

    Measured the only way that is fair: bring the enhanced picture back
    down to the original's size and compare like with like. Structure is
    SSIM on lightness; colour is the mean shift in LAB's a/b, which is
    what catches a finish quietly turning from chrome to brass while the
    shapes all still line up.
    """
    h, w = original_bgr.shape[:2]
    back = cv2.resize(enhanced_bgr, (w, h), interpolation=cv2.INTER_AREA)

    lab_o = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2LAB)
    lab_b = cv2.cvtColor(back, cv2.COLOR_BGR2LAB)

    structure = ssim(lab_o[:, :, 0], lab_b[:, :, 0])

    mask = artwork_mask(original_bgr) > 0
    if mask.sum() < 16:
        mask = np.ones(original_bgr.shape[:2], bool)
    drift = math.sqrt(
        float(lab_o[:, :, 1][mask].mean() - lab_b[:, :, 1][mask].mean()) ** 2
        + float(lab_o[:, :, 2][mask].mean() - lab_b[:, :, 2][mask].mean()) ** 2
    )

    return round(structure, 4), round(drift, 2)


# --- loading and framing --------------------------------------------------


def load_on_white(path, mask_path=None):
    """An original plus its alpha stream, composited onto white.

    Returns the full composited canvas, the artwork mask over it, the
    trimmed artwork, and whether the PDF supplied a real alpha channel.

    All four, rather than just the trimmed picture, because two of the
    grading tests are questions *about the background* — is this a cut-out
    or a room photograph, does the product run off the edge — and trimming
    to the artwork destroys the evidence for both. Grading a trimmed
    picture says every product is cropped, because trimming is what put
    the product against the frame.
    """
    base = Image.open(path)
    native = base.size
    base = base.convert("RGB")

    had_alpha = False
    mask = None

    if mask_path and Path(mask_path).exists():
        alpha = Image.open(mask_path).convert("L")
        if alpha.size != base.size:
            alpha = alpha.resize(base.size, Image.LANCZOS)
        white = Image.new("RGB", base.size, (255, 255, 255))
        white.paste(base, (0, 0), alpha)
        base = white
        had_alpha = True
        mask = np.array(alpha.point(lambda v: 255 if v > 8 else 0), dtype=np.uint8)

    full = cv2.cvtColor(np.array(base), cv2.COLOR_RGB2BGR)
    if mask is None:
        mask = artwork_mask(full)

    ys, xs = np.where(mask > 0)
    if len(xs):
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        pad_x = max(1, int((x1 - x0) * 0.02))
        pad_y = max(1, int((y1 - y0) * 0.02))
        x0, y0 = max(0, x0 - pad_x), max(0, y0 - pad_y)
        x1, y1 = min(full.shape[1], x1 + pad_x), min(full.shape[0], y1 + pad_y)
        trimmed = full[y0:y1, x0:x1]
    else:
        trimmed = full

    return full, mask, trimmed, had_alpha, native


def to_canvas(bgr, canvas=CANVAS, padding=PADDING):
    """Centre the product on a pure-white square, proportions intact.

    Contain, never cover: a tap stretched to fill a square is a tap the
    customer will not recognise when it arrives.
    """
    target = int(canvas * (1 - 2 * padding))
    h, w = bgr.shape[:2]
    scale = target / max(h, w)

    # Only ever shrink here. Enlarging is the enhancement stage's job and
    # it is accountable for it; silently doubling a picture at framing
    # time would hide an upscale nobody graded.
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4
    resized = cv2.resize(bgr, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=interp)

    out = np.full((canvas, canvas, 3), 255, np.uint8)
    y = (canvas - resized.shape[0]) // 2
    x = (canvas - resized.shape[1]) // 2
    out[y : y + resized.shape[0], x : x + resized.shape[1]] = resized
    return out


# --- one picture ----------------------------------------------------------


def process(path, mask_path, out_dir, stem, meta, args):
    full, mask, original, had_alpha, native = load_on_white(path, mask_path)
    status, facts = grade(full, mask, original, had_alpha)

    record = {
        **meta,
        "originalFile": str(path),
        "nativeWidth": native[0],
        "nativeHeight": native[1],
        "status": status,
        **facts,
        "enhanced": False,
        "steps": [],
    }

    out_dir = Path(out_dir)
    (out_dir / "original").mkdir(parents=True, exist_ok=True)
    (out_dir / "final").mkdir(parents=True, exist_ok=True)

    # The original, exactly as it came out of the PDF, always kept.
    original_png = out_dir / "original" / f"{stem}.png"
    cv2.imwrite(str(original_png), original)
    record["originalKept"] = str(original_png)

    if status == "INVALID":
        return record

    work = original
    needs_work = status in ("LOW_RESOLUTION", "BLURRY")

    if needs_work and not args.grade_only:
        if args.denoise:
            work = denoise(work)
            record["steps"].append("denoise")

        long_side = max(work.shape[:2])
        if long_side < GOOD_LONG_SIDE:
            wanted = GOOD_LONG_SIDE / long_side
            factor = 4 if wanted > 2 else 2
            used = None
            if args.esrgan:
                try:
                    work = esrgan_upscale(work, args.esrgan, args.esrgan_models, factor)
                    used = f"real-esrgan x{factor}"
                except Exception as error:  # noqa: BLE001 - reported, not raised
                    record["esrganError"] = f"{type(error).__name__}: {error}"
            if used is None:
                work = upscale_lanczos(work, factor)
                used = f"lanczos x{factor}"
            record["steps"].append(used)

        work = sharpen_luma(work, amount=args.sharpen)
        record["steps"].append(f"unsharp-luma {args.sharpen}")

        if facts.get("backgroundPlain"):
            work = clean_background(work)
            record["steps"].append("background-to-white")

        structure, drift = fidelity(original, work)
        record["fidelitySsim"] = structure
        record["chromaDrift"] = drift
        if structure < FIDELITY_FLOOR or drift > CHROMA_DRIFT_CEILING:
            record["status"] = "MANUAL_REVIEW"
            record["reason"] = (
                f"enhanced copy diverges from the original "
                f"(ssim {structure}, colour drift {drift})"
            )
            work = original
            record["steps"].append("reverted — failed fidelity gate")
        else:
            record["enhanced"] = True

    final = to_canvas(work)
    final_path = out_dir / "final" / f"{stem}.webp"
    Image.fromarray(cv2.cvtColor(final, cv2.COLOR_BGR2RGB)).save(
        final_path, "WEBP", quality=88, method=6
    )
    record["finalFile"] = str(final_path)
    record["finalBytes"] = final_path.stat().st_size

    if args.contact_sheet:
        pair = np.full((CANVAS, CANVAS * 2 + 24, 3), 245, np.uint8)
        pair[:, :CANVAS] = to_canvas(original)
        pair[:, CANVAS + 24 :] = final
        (out_dir / "compare").mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(out_dir / "compare" / f"{stem}.jpg"), pair, [cv2.IMWRITE_JPEG_QUALITY, 90])

    return record


# --- entry point ----------------------------------------------------------


def from_index(args):
    """Pick work out of an extraction manifest.

    Two shapes are accepted, and the first is better: the extractor's own
    `rows.json`, which names each image's separate alpha stream and its
    catalogue number, and `index.json` from build-catalogue-preview,
    which has neither — its files are already composited and trimmed, so
    starting from them means grading a JPEG of a JPEG.
    """
    index = json.loads(Path(args.index).read_text())

    if "images" in index and "rows" not in index:
        rows = [
            {
                "file": r["file"],
                "mask_file": r.get("mask_file"),
                "item": r.get("item"),
                "cat_nos": r.get("cat_nos"),
                "series": r.get("series"),
                "folio": r.get("folio"),
                "source_file": r["file"],
            }
            for r in index["images"]
            if r.get("kind") == "product" and r.get("file")
        ]
        # One row per file: the catalogue prints the same photograph
        # against several finishes, and grading it six times is six times
        # the work for one answer.
        seen, unique = set(), []
        for row in rows:
            if row["file"] in seen:
                continue
            seen.add(row["file"])
            unique.append(row)
        rows = unique
        index.setdefault("brand", "Hindware")
        index.setdefault("source_pdf", "")
    else:
        rows = index["rows"]

    if args.match:
        wanted = [m.strip().lower() for m in args.match.split(",") if m.strip()]
        rows = [
            r
            for r in rows
            if any(w.replace(" ", "") in (r.get("item") or "").lower().replace(" ", "") for w in wanted)
        ]

    rows.sort(key=lambda r: (r.get("item") or "", r.get("file") or ""))
    if args.limit:
        picked, seen = [], {}
        for row in rows:
            key = (row.get("item") or "")[:28]
            if seen.get(key, 0) >= args.per_item:
                continue
            seen[key] = seen.get(key, 0) + 1
            picked.append(row)
            if len(picked) >= args.limit:
                break
        rows = picked

    originals = Path(os.path.expanduser(args.originals)) if args.originals else None
    jobs = []
    for row in rows:
        source = row.get("source_file") or row["file"]
        path = (originals / source) if originals else Path(args.index).parent / row["file"]
        if not path.exists():
            path = Path(args.index).parent / row["file"]
        mask = None
        if originals and row.get("mask_file"):
            candidate = originals / row["mask_file"]
            mask = candidate if candidate.exists() else None
        jobs.append(
            (
                path,
                mask,
                Path(row["file"]).stem,
                {
                    "sku": row.get("cat_nos") or "",
                    "name": row.get("item") or "",
                    "series": row.get("series") or "",
                    "brand": index.get("brand") or "",
                    "sourcePdf": index.get("source_pdf") or "",
                    "page": row.get("folio") or row.get("sheet"),
                },
            )
        )
    return jobs


def main():
    parser = argparse.ArgumentParser(description="Local, free image grading and enhancement.")
    parser.add_argument("--index", help="a build-catalogue-preview index.json")
    parser.add_argument("--originals", help="directory of the untouched extracted images")
    parser.add_argument("--files", nargs="*", default=[], help="image files, instead of --index")
    parser.add_argument("--out", required=True, help="where originals, finals and the report go")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--per-item", type=int, default=2, help="cap per product name, with --limit")
    parser.add_argument("--match", help="comma-separated product-name filters")
    parser.add_argument("--grade-only", action="store_true", help="classify, enhance nothing")
    parser.add_argument("--no-denoise", dest="denoise", action="store_false")
    parser.add_argument("--sharpen", type=float, default=0.55)
    parser.add_argument("--esrgan", help="path to realesrgan-ncnn-vulkan, if installed")
    parser.add_argument("--esrgan-models", help="its models directory")
    parser.add_argument("--contact-sheet", action="store_true", help="write before/after pairs")
    args = parser.parse_args()

    if args.index:
        jobs = from_index(args)
    elif args.files:
        jobs = [(Path(f), None, Path(f).stem, {}) for f in args.files]
    else:
        sys.exit("give --index or --files")

    if not jobs:
        sys.exit("nothing matched")

    records = []
    for i, (path, mask, stem, meta) in enumerate(jobs, 1):
        try:
            records.append(process(path, mask, args.out, stem, meta, args))
        except Exception as error:  # noqa: BLE001 - one bad file must not stop a batch
            records.append({**meta, "originalFile": str(path), "status": "INVALID",
                            "reason": f"{type(error).__name__}: {error}"})
        if i % 25 == 0:
            print(f"  {i}/{len(jobs)}", flush=True)

    report = Path(args.out) / "report.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"count": len(records), "images": records}, indent=1))

    counts = {}
    for record in records:
        counts[record["status"]] = counts.get(record["status"], 0) + 1
    print(f"\n{len(records)} image(s)")
    for status, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {status:<16} {n}")
    enhanced = [r for r in records if r.get("enhanced")]
    if enhanced:
        ssims = sorted(r["fidelitySsim"] for r in enhanced if "fidelitySsim" in r)
        print(f"  enhanced: {len(enhanced)}, fidelity ssim min {ssims[0]}, median {ssims[len(ssims)//2]}")
    print(f"report: {report}")


if __name__ == "__main__":
    main()
