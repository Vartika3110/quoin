# PDF image extraction — the ten-product test

**Status: test complete on 10 products. Nothing bulk-processed.**

Run it again with:

```
.venv/bin/python research/test-image-extraction.py \
    "/Users/gg/Desktop/Catalogue A - Rest of India LR.pdf" --count 10 --pages 60-90
```

Output (gitignored run output, not a source): `research/data/extraction-test/`
— every method's file per product, a side-by-side sheet per product,
`REPORT.md`, `report.json` and `inventory.json`.

---

## 1. The libraries

| Library | Used for | State |
| --- | --- | --- |
| PyMuPDF (fitz) | `page.get_images(full=True)`, `doc.extract_image(xref)`, placement geometry, decoding soft masks | installed, 1.26.5 |
| pikepdf | reading the raw image streams, cross-checking PyMuPDF's bytes | installed this session, 9.11.0 |
| pdfplumber | page text, product codes, prices, image boxes, region rendering | installed, 0.11.8 |
| Pillow | compositing, trimming, resizing, the comparison sheets | installed, 11.3.0 |
| OpenCV | Laplacian-variance sharpness | installed, 5.1.0 |
| NumPy | artwork bounding boxes from alpha | installed, 2.0.2 |
| **Poppler (`pdfimages`)** | — | **not available: Homebrew is not installed on this machine** |

`pdfimages -list` and `-all` were the brief's first two requirements, and
they are the two that could not be run. Homebrew is not installed, and
installing it to get one binary was not worth doing unannounced.

**It cost nothing.** `pdfimages -all` writes the image XObject's stored
stream to disk; so does pikepdf's `read_raw_bytes()`. The test runs both
remaining routes and compares the bytes: **7 of 10 images came back
byte-identical from PyMuPDF and pikepdf.** The other 3 are the
`FlateDecode`/`Indexed` images, where `extract_image` re-encodes to PNG
(8,489 bytes against the stored stream's 4,278) — lossless, but not the
original bytes. So: **pikepdf is the right tool when the stored bytes
must be preserved exactly**, and that is the one place PyMuPDF quietly
does something other than what it says.

Say the word and I will install Homebrew and poppler and add
`pdfimages -list` to the inventory as a third opinion.

## 2. What the Hindware catalogue actually holds

Measured over the 103 image objects on the tested pages:

- Effective DPI: **min 96, median 102, max 114**
- **53 of 103 carry a soft mask** — and **10 of the 10 tested products do**
- Filters present: `DCTDecode`/ICCBased (JPEG) and `FlateDecode`/Indexed

Per product, native frame against the artwork inside it:

| Code | Native frame | Artwork after trim |
| --- | --- | --- |
| F860090RGD | 289×255 | 157×110 |
| F880001GRT | 310×273 | 43×233 |
| F530014 | 162×143 | 117×82 |
| F530003 | 210×185 | 138×68 |
| F530020 | 167×147 | 87×121 |
| F530001 | 230×202 | 117×82 |
| F530004 | 194×171 | 133×67 |
| F530043 | 322×284 | 110×85 |
| F530027 | 192×169 | 107×112 |
| F410012 | 267×235 | 164×103 |

The long side of the actual product is **67–233 px**. This confirms the
earlier audit on a second, independent code path: the images are small
because that is their size in the PDF, not because extraction degraded
them.

## 3. The soft mask is the whole game

**Extracting the embedded image is necessary and not sufficient.** Every
tested product stores its colour in one stream and its transparency in a
separate `/SMask` object. Decode the colour stream alone — which is what
`pdfimages -all` and a naive `extract_image` both give you — and you get
the product on a **black** field. The sheets show it: `embedded-raw` is
black-backed in every one of the ten.

The mask has to be fetched by its own xref and applied. That is
`composite_on_white()` in the script; the first version of it silently
did not do this, and the numbers looked fine while the images were
wrong, which is the reason the test renders pictures and not only tables.

## 4. Method comparison

| Method | What it is | Verdict |
| --- | --- | --- |
| `embedded-raw` | stored bytes, untouched | keep as provenance; unusable as a photograph until masked |
| `embedded-pikepdf` | same stream, independent reader | byte-exact; use when the original encoding matters |
| `embedded-onwhite` | decoded + `/SMask` + composited | **the honest original photograph** |
| `render-object-native` | the image's own rectangle, rendered at the DPI it holds | within a few px of `embedded-onwhite`; proves rendering is not inherently lossy |
| `render-native` | the whole product box, at the highest DPI any image in it holds | best when a product is several objects plus vector overlays |
| `render-200` | today's fixed 200 DPI | **2.0× interpolation, zero added detail** |

The decisive number is `genuine px`: artwork long side ÷ how far the
method interpolated past the source's own resolution. On F530014:
`render-200` outputs 324×276 and `embedded-onwhite` outputs 162×143 —
and both carry about 117 px of real artwork. The bigger file is not the
better file.

**So the fixed 200 DPI render is not throwing detail away on these
catalogues; it is inflating.** Replacing the constant with the adaptive
DPI (implemented in `native_dpi_for()`) matters for the day a supplier
sends a 300 or 600 DPI catalogue, not for this one.

## 5. The defect worth more than resolution

**4 of the 10 crops contain more than one product code** — F880001GRT's
crop holds **12**. The 3 pt merge step joins a printed row into one box,
and the caption parser then files a photograph of four ceiling showers
under a tumbler holder's code. F880001GRT's sheet shows exactly that.

A crop like this looks fine in a spreadsheet, scores well on every
resolution metric, and puts the wrong photograph on a product page. The
test now flags it (`single_product: false`, `codes_inside_box`), and
whole-box renders are disqualified from the per-product verdict when it
trips.

Six boxes larger than 30% of their page were skipped outright as page
layouts rather than products.

## 6. Vector

There is **no vector product catalogue on this machine** to test.
`Delhi-UCO-Collection.pdf` has no raster images, which is why the earlier
audit named it — but it is a document about cooking-oil margins, not a
catalogue, so there are no products in it to extract.

The mechanism still checks out, on its vector artwork
(`--vector-demo 4`): 100 dpi → 200 dpi is a genuine detail gain, unlike
any raster upscale. Above that the Laplacian measure is confounded by
the downscale it does before measuring, so the 600 dpi figure should not
be read as a decline — look at `vector-comparison.png` instead, where
200 and 600 are both crisp and 100 is visibly rough.

Per-product boxes on a pure-vector page cannot be found the way they are
found today, because the finder reads `page.images` and there are none.
That needs drawing-cluster detection, which does not exist yet and is
not worth writing before a vector catalogue actually arrives.

## 7. What changed in the extractor

All three are now in `research/extract-catalogue-sheet.py`.

1. **The photograph is taken from the PDF's own embedded image** where
   one placed image covers the product's box (`dominant_image`), masked
   onto white. Nothing is resampled. Where a product is several objects,
   or vector, it is still rendered from the page.
2. **`RENDER_DPI = 200` is gone**, replaced by `render_dpi_for()`: the
   highest effective DPI of the images in the box, floored at 96, capped
   at 2,000 px on the long side, and 600 DPI for a box with no raster in
   it at all.
3. **Crops holding more than one product code are rejected**
   (`codes_inside`), counted and reported rather than imported.

Each row now records which route produced its photograph, in a
`photography` field on the manifest.

### A bug this found

PyMuPDF measures from the **CropBox** and pdfplumber from the
**MediaBox**. Every page of this catalogue insets its CropBox by 28.35pt
(10mm), so comparing boxes between the two libraries without that shift
slides every rectangle 10mm up and left. It still overlaps the right
image, by less — so a product drawn as one image reads as a product
drawn from several, and not one photograph took the embedded route. Both
this script and the test harness had it; `to_fitz_box()` is the fix.

### What it cost

On pages 60–90 of the Hindware catalogue:

| | Before | After |
| --- | --- | --- |
| Rows written | 69 | 42 |
| Photographs taken from the embedded image | 0 | 38 |
| Photographs rendered from the page | 69 | 4 |
| Image files written | 69 (1,759 KB) | 42 (102 KB) |

The 27 rows that went away were all whole-row renders: a photograph of
several products filed under one of their codes. **No product that had a
correct photograph lost it.**

But those 27 rectangles have **246 distinct product codes printed inside
them**, and none of those products is extracted anywhere else. They were
not being captured before either — one row with one code and a
photograph of its neighbours is not a capture — so this is a gap made
visible, not a gap created. Splitting a crowded rectangle into one crop
per printed code is the obvious next piece of work, and it is the only
way those 246 products arrive with the right photography.

## 8. Still open

1. **Split a crowded rectangle into one crop per printed code.** This is
   what would capture the 246 products above, with the right photograph
   on each. Nothing else on this list is worth as much.
2. Only then consider upscaling, under the fidelity gate the earlier
   audit specifies. The ceiling has not moved: ~130 px of artwork, 4×
   honest maximum.
3. The cheapest fix is still not code: ask Hindware, Jaquar and Ozone for
   the print-resolution catalogue or the product image library.
