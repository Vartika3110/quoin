"""Build the web-viewable copies that /hindware draws.

Usage:

    python3 research/build-catalogue-preview.py \
        public/catalogue-preview/hindware-a

Reads the extraction output in ~/Desktop/Catalogue-A-extracted (set
CATALOGUE_EXTRACT to point somewhere else) and writes a JPEG per product
image plus an index.json beside them. The output is committed, like
public/catalogue: /hindware has to work on a deployed URL, and a deploy
without these files is a page that explains why it is empty. Rerun this
script rather than editing an output file by hand.

**The originals are never written to.** Three things happen to a copy, and
nothing else:

  1. the separate alpha (SMask) stream is composited onto white, because a
     browser cannot pair two PDF streams the way a PDF viewer does;
  2. the result is trimmed to the artwork's own bounding box, dropping the
     transparent padding the catalogue's layout left around each tap;
  3. it is saved as JPEG on white.

Nothing is upscaled, ever. The pixel count written out is never larger
than the pixel count read in, because the page exists to show whether the
PDF's own artwork is big enough to sell from — and an enlarged picture
cannot answer that question. It would make 1,044 unusable images look
like 1,044 usable ones.
"""

import json, os, sys
from PIL import Image

SRC = os.path.expanduser(
    os.environ.get("CATALOGUE_EXTRACT", "~/Desktop/Catalogue-A-extracted")
)
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

rows = json.load(open(os.path.join(SRC, "rows.json")))

# One record per unique image file, keeping the first placement's metadata
# but collecting every placement so a reused image is not shown twice.
uniq = {}
for r in rows["images"]:
    if r["kind"] != "product":
        continue
    # An inline image has no independent PDF object and so no file on
    # disk. There are a handful; they were never extractable and their
    # absence here is not a failure.
    if not r["file"]:
        continue
    u = uniq.get(r["file"])
    if u is None:
        u = uniq[r["file"]] = dict(r, placements=[])
    u["placements"].append(
        {"sheet": r["sheet"], "folio": r["folio"], "series": r["series"],
         "item": r["item"], "cat_nos": r["cat_nos"], "size_mm": r["size_mm"],
         "price_inr": r["price_inr"], "section": r["section"]}
    )

out_rows, failed = [], []
for i, (fname, r) in enumerate(sorted(uniq.items()), 1):
    try:
        base = Image.open(os.path.join(SRC, "images", fname))
        src_w, src_h = base.size
        base = base.convert("RGB")

        box = None
        if r.get("mask_file"):
            m = Image.open(os.path.join(SRC, "images", r["mask_file"])).convert("L")
            if m.size != base.size:
                m = m.resize(base.size, Image.LANCZOS)
            white = Image.new("RGB", base.size, (255, 255, 255))
            white.paste(base, (0, 0), m)
            base = white
            # Artwork is where the mask is not fully transparent.
            box = m.point(lambda v: 255 if v > 8 else 0).getbbox()

        if box:
            pad_x = max(1, int((box[2] - box[0]) * 0.02))
            pad_y = max(1, int((box[3] - box[1]) * 0.02))
            box = (max(0, box[0] - pad_x), max(0, box[1] - pad_y),
                   min(base.size[0], box[2] + pad_x), min(base.size[1], box[3] + pad_y))
            base = base.crop(box)

        stem = os.path.splitext(fname)[0]
        web = stem + ".jpg"
        base.save(os.path.join(OUT, web), "JPEG", quality=88, optimize=True,
                  progressive=True)

        p0 = r["placements"][0]
        out_rows.append({
            "file": web,
            "source_file": fname,
            "sha1": r["sha1"],
            "src_w": src_w, "src_h": src_h,
            "web_w": base.size[0], "web_h": base.size[1],
            "trimmed": box is not None,
            "bytes": os.path.getsize(os.path.join(OUT, web)),
            "regime": r["regime"],
            "series": p0["series"], "item": p0["item"], "cat_nos": p0["cat_nos"],
            "size_mm": p0["size_mm"], "price_inr": p0["price_inr"],
            "section": p0["section"], "sheet": p0["sheet"], "folio": p0["folio"],
            "reused": len(r["placements"]) > 1,
            # The placement list itself is deliberately not written out.
            # Every row here is serialised into the RSC payload the page
            # sends to the browser, nothing reads the array, and it cost
            # 206 KB of the index on its own. `reused` is the part that
            # earns its place: it marks an image the catalogue prints
            # against more than one product.
        })
    except Exception as e:
        failed.append({"file": fname, "error": f"{type(e).__name__}: {e}"})
    if i % 200 == 0:
        print(f"  {i}/{len(uniq)}", flush=True)

out_rows.sort(key=lambda r: (r["series"] or "zzz", r["sheet"], r["cat_nos"]))

index = {
    "source_pdf": "Catalogue A - Rest of India LR.pdf",
    "source_dir": SRC,
    "brand": "Hindware",
    "built": __import__("datetime").date.today().isoformat(),
    "count": len(out_rows),
    "failed": failed,
    "rows": out_rows,
}
json.dump(index, open(os.path.join(OUT, "index.json"), "w"), indent=1)
print(f"wrote {len(out_rows)} web copies, {len(failed)} failed")
print("total MB", round(sum(r['bytes'] for r in out_rows) / 1e6, 1))
