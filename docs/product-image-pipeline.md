# Product image pipeline — audit before building

**Status: audit only. No code written for this yet.**

> **Superseded in part (18 Nov 2026): the budget is ₹0.** No paid API, no
> subscription, no credits — everything runs locally on open-source
> libraries. That settles §6's provider and budget questions and rules out
> Replicate and Topaz where they appear below. The rest of the audit —
> especially the measurements in §1 and §2 — is unaffected: the source
> PDFs are still 96–150 DPI, and 4× is still the honest ceiling. See
> `research/enhance-product-images.py` for the local pipeline that
> replaces §6's paid options.

Phase 1 of the brief was to look before rewriting. This is what the
looking found, what the repository already does, and what is actually
worth building. The headline is that the diagnosis in the brief is wrong
in a way that changes the plan — not fatally, but enough that building to
the brief as written would spend most of its effort in the wrong place.

---

## 1. The finding that changes the brief

> "We extract product images from PDF catalogues... However, many
> extracted images have extremely poor resolution."

The three examples given are real files, and I found them:

| File | Size | Product |
| --- | --- | --- |
| `public/catalogue-preview/hindware-a/x02249_p069.jpg` | 58 × 307 | gold health faucet |
| `public/catalogue-preview/hindware-a/x02247_p069.jpg` | 61 × 269 | health faucet |
| `public/catalogue-preview/hindware-a/x02251_p069.jpg` | 87 × 112 | waste coupling |

**They are not small because extraction degraded them. They are small
because that is the size they are inside the PDF.**

I measured the embedded rasters in every catalogue on this machine. A PDF
records, for each placed image, both its native pixel size and the size of
the box it is drawn into — which gives the effective DPI exactly:

| Catalogue | Effective DPI of embedded images | Native short side (median) |
| --- | --- | --- |
| `Catalogue A - Rest of India LR.pdf` (Hindware) | **100** | 219 px |
| `CG VOL. 22_2026-27_web.pdf` (Jaquar) | **150** | 225 px |
| `Kitchen & Furniture Fittings Edition #6` (Ozone) | **96** | 126 px |
| `Delhi-UCO-Collection.pdf` | no raster images at all — pure vector | — |
| `START HERE.pdf` | no raster images at all — pure vector | — |

Print work is 300 DPI. These are 96–150 DPI web editions. The Hindware
file says so in its own filename: **LR**.

And the artwork is smaller still than the raster, because each image
carries transparent padding that gets trimmed away. Across all 1,044
Hindware product images:

| | p10 | median | p90 | max |
| --- | --- | --- | --- | --- |
| Source raster, long side | — | 233 px | 360 px | 662 px |
| **Actual artwork after trim, long side** | 113 px | **130 px** | 237 px | 662 px |
| Actual artwork after trim, short side | 57 px | 96 px | 155 px | 407 px |

**5 images out of 1,044 have a long side of 500 px or more.**

### What this means for each part of the brief

- **§3 "Extract at original resolution" is already satisfied.** The
  current extractor renders page regions at 200 DPI, which is *above* the
  native 96–150 DPI of all three catalogues. There is no hidden detail
  being thrown away today. The one real defect is that 200 is a constant:
  the day a supplier sends a 300 or 600 DPI print catalogue, that constant
  silently discards half the detail. Fixing it is cheap (§4 below) and
  worth doing — just not because of these three files.
- **§4 "detect raster vs vector, render vector higher" is worth real
  money**, and the evidence is on the Desktop: two of five PDFs contain no
  raster images whatsoever. Vector artwork can be rendered at any
  resolution you like. For those catalogues the resolution problem simply
  does not exist, provided the renderer knows to go higher.
- **§5 AI upscaling is the only lever for the Hindware set**, and it has a
  hard ceiling, below.

### The cheapest fix is not code

A file named `Catalogue A - Rest of India **LR**.pdf` implies a non-LR
edition exists. One email to the Hindware dealer asking for the
high-resolution catalogue or the product image library would beat every
phase of this plan on fidelity, cost and time. The same request is worth
making to Jaquar and Ozone. I would send those emails before, not instead
of, building — but genuinely before.

There is also a rights question already recorded in your own
`quoin_master_catalog_pdf_image_match_audit.xlsx`, sheet **Image Rights
Audit**: *"Manufacturer website images — do not assume reuse is
allowed."* Asking the supplier for images is also how that gets settled.

---

## 2. The honest ceiling on upscaling

A product card renders at 300 CSS px on desktop (`ProductCard.tsx:191`),
which is **600 px of real pixels on a retina screen**. A 1000 × 1000
canvas with 12% padding needs about **780 px** of artwork to fill it.

Starting from the Hindware median of 130 px:

| Upscale | Result | Verdict |
| --- | --- | --- |
| 2× | 260 px | still soft on a card |
| **4×** | **520 px** | **good on a card, short of filling a 1000 px canvas** |
| 6× | 780 px | fills the canvas — but a 6× model is inventing 97% of the pixels |

So: **4× is the limit at which a restoration model is still restoring.**
At 4× the median Hindware product will sit on a 1000 × 1000 canvas
carrying about 520 px of genuine artwork. That looks right on a listing
card and soft on a full-screen product page. Getting past that honestly
requires better source files, not a bigger multiplier.

This matters because of the brief's own rule, which I agree with:

> Never generate a replacement product image that merely looks similar to
> the original.

A diffusion "creative upscaler" at 6× on a 58 × 307 gold faucet will
produce a beautiful gold faucet that is not this gold faucet. The
threading, the lever shape and the hose weave at that size are a few dozen
pixels; a generative model will confidently redraw them. That is why the
plan below specifies a **restoration** model (Real-ESRGAN class), not a
generative one, and adds a fidelity gate that measures the enhanced image
against the original and routes divergence to manual review rather than to
the storefront.

---

## 3. What the repository already does

This is the part the brief could not know. Most of the twelve
requirements already exist in some form, and the existing versions are
more conservative than the brief asks for — deliberately.

| Brief | Already in the repo |
| --- | --- |
| §3 PDF extraction | `research/extract-catalogue-sheet.py` (layout-agnostic, built this session), `research/extract-brand-catalogue.py` (per-brand profiles for Jaquar/Ozone), `research/build-catalogue-preview.py` (composites the alpha mask onto white, trims to artwork, **never upscales**) |
| §4 Quality detection | partial: `scripts/audit-photo-backgrounds.ts` samples the border ring to tell a studio cut-out from a room photograph; `ImageQuality` enum + `scripts/backfill-image-quality.ts` |
| §5 AI enhancement | `src/lib/images/generator.ts` — a provider-agnostic `ImageGenerator` interface with an OpenAI implementation. **Generation, not upscaling**, and everything it writes is flagged `imageIsGenerated` and labelled on the storefront |
| §6 Standardisation | `scripts/normalise-catalogue-images.ts` — trims, scales to a fixed share of a square canvas, centres on pure white, refuses files shot on a dark or coloured ground. Currently 800 px JPEG. `scripts/webp-generated-images.ts` does WebP re-encoding |
| §7 SKU matching | `scripts/pair-images-by-code.ts` — **exact code matches only**, including the finish-stripped form. Name similarity was tried and explicitly rejected: *"Wall Mounted Single Lever Basin Mixer" scores 0.63 against "Floor Mounted…", which is a different product* |
| §8 Admin dashboard | `/admin/images` exists — `src/app/admin/images/page.tsx`, `ImagePairing` component, `api/v1/admin/harvest/*` to browse the harvested pool, `api/v1/admin/products/[sku]/image` to assign one by hand. Brand filter and "products without a photograph" counts already work |
| §9 Storage | `src/lib/storage/` provider abstraction, `StoredFileKind.PRODUCT_IMAGE`, a **public** Supabase bucket separate from the private uploads bucket, `scripts/upload-catalogue-images.ts`, `next.config.ts` `remotePatterns` already admitting that bucket to the image optimiser |
| §9 Lazy/responsive | `next/image` throughout; `ProductImage.tsx` takes a `sizes` prop; cards pass `(min-width: 1280px) 300px, …` |
| §12 Real PDFs to test with | three in the repo root, two more on the Desktop, plus `~/Desktop/Catalogue-A-extracted` |

Two existing decisions I intend to keep rather than rewrite, because the
brief independently asks for both:

1. **A wrong photograph is worse than no photograph.** Hence exact-code
   matching only, and a human pairing screen for the rest.
2. **Nothing generated is passed off as a photograph.** 877 products
   currently carry AI illustrations flagged `imageIsGenerated`, and your
   own audit workbook lists them as *"AI illustration only — not
   verified"*. Enhanced-but-faithful is a third state and needs its own
   flag; it must not quietly join either bucket.

---

## 4. What is actually missing

In priority order, by value per unit of work:

1. **Adaptive render DPI + raster/vector detection.** Replace the fixed
   200 DPI with: read each placed image's native pixel size, render the
   crop at whatever DPI preserves it (capped, say, at 600), and for
   regions with no raster at all — the Delhi-UCO case — render at a high
   fixed DPI because vector has no native size. Also record, per image,
   whether it came from raster or vector and at what DPI. *Small change,
   permanent benefit, and it is the only part of §3 that is not already
   done.*
2. **A quality-detection module** producing the five statuses the brief
   names. Prototyped during this audit on 300 real Hindware files:
   dimensions and a Laplacian-variance sharpness measure already separate
   them cleanly (298 of 300 land in `LOW_RESOLUTION`, which is the
   correct answer for that catalogue). Needs adding: transparency,
   background uniformity (reuse `audit-photo-backgrounds.ts`), crop
   detection (artwork touching the frame edge), and multi-product
   detection (connected-component count after background removal).
3. **An `ImageUpscaler` interface** mirroring `ImageGenerator`, with a
   Real-ESRGAN-class implementation, 2× and 4×, called only from the
   server, key only in the environment.
4. **The fidelity gate.** Downscale the enhanced image back to the
   original's dimensions and compare it with the original (SSIM or a
   perceptual hash); hold the mean hue of the product region constant
   within a tolerance for metallic finishes. Over threshold →
   `MANUAL_REVIEW`, never auto-publish. *This is the thing that makes "AI
   enhancement" safe to switch on, and it does not exist anywhere yet.*
5. **A `ProductImage` table.** Today a product has one `image` string.
   The brief needs original and enhanced kept separately, with status,
   provenance (PDF filename, page), approval state and the final URL —
   that is a row per image, not a column. `Product.image` stays as the
   *published* pointer so nothing on the storefront changes.
6. **Admin screen extension**: side-by-side original/enhanced with
   resolution and status, approve/reject, bulk approve, reprocess, the
   extra filters, and the Excel/CSV export. Built onto `/admin/images`,
   not beside it.
7. **1000 × 1000 WebP** as the standard canvas — a parameter change to
   `normalise-catalogue-images.ts` plus a WebP encode, not a new script.

---

## 5. Proposed phases

Each phase is independently useful and leaves the site working.

| Phase | What ships | Notes |
| --- | --- | --- |
| **0** | Ask the three suppliers for high-resolution catalogues / image libraries | Not code. Highest fidelity per hour spent, and it settles the rights question |
| **1** | *(this document)* | done |
| **2** | Adaptive-DPI extraction, raster/vector detection, originals preserved untouched | Extends the extractor built this session; no database change |
| **3** | Quality detection → the five statuses, written to a new `ProductImage` row; a report over the existing 3,159 images | Read-only against the storefront; tells us how big the real problem is beyond Hindware |
| **4** | `ImageUpscaler` interface + provider + **fidelity gate**; nothing auto-publishes | Needs a provider decision and a budget — see below |
| **5** | 1000 × 1000 WebP standardisation; original kept as a separate file | Parameterises the existing normaliser |
| **6** | Admin: side-by-side review, approve/reject, bulk approve, reprocess, filters, Excel export | Built onto `/admin/images` |
| **7** | Publish approved images; `Product.image` repointed; test on Hindware + Jaquar end to end | The only phase that touches live product rows |

Phases 2 and 3 can run in parallel with 0. Phase 4 should not start until
3 has reported, because 3 tells us how many images actually need
upscaling — if the answer outside Hindware is "a few hundred", the
economics change.

---

## 6. Decisions needed before Phase 2

1. **Upscaling provider.** My recommendation: Replicate running a
   Real-ESRGAN-class restoration model — it restores rather than redraws,
   which is what the metallic-finish rule requires. The alternatives are
   Topaz (better results, paid API, heavier integration) and a generative
   upscaler (best-looking, and the one most likely to redraw a product
   into something that is not it). The interface means this is one class
   either way.
2. **Budget and volume.** Roughly 1,044 Hindware + an unknown number
   elsewhere. At typical Replicate pricing a 4× pass is on the order of
   a few US cents per image; 1,000 images is single-digit dollars, but I
   would rather you set a ceiling than discover one.
3. **Canvas.** 1000 × 1000 as the brief says, accepting that LR-sourced
   products will carry ~520 px of real artwork inside it? Or 800 × 800 —
   the current canvas, closer to the real information content, and
   already what every existing file is?
4. **Where enhanced images live.** The public Supabase bucket (where the
   877 generated images already are) or `public/catalogue` (committed,
   116 MB today)? I would use the bucket for anything new.
5. **How an enhanced image is labelled.** Generated images carry
   `imageIsGenerated` and are labelled on the storefront. An upscaled
   photograph is a photograph, so I would not label it to customers — but
   it must be distinguishable in the database, which the new table gives
   us.

---

## 7. What I will not do without you saying so

- Overwrite any original. Enhanced output is a new file, always.
- Auto-publish an enhanced image that fails the fidelity gate.
- Change `Product.image` for any product until Phase 7, approved image by
  approved image.
- Touch the 877 AI illustrations. They are a separate problem — those
  products need real photography, not a sharper illustration.
