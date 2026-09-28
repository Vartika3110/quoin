---
name: image-brief
description: Art-direct and produce any image this repo needs — catalogue product illustrations, Studio interiors, hero and promo art, category tiles, nav thumbnails, social and ad crops. Use this whenever the user asks for an image, photo, illustration, hero, banner, thumbnail, poster or "a picture of X", asks to fix, recrop, upscale, inpaint or outpaint an existing one, asks what aspect ratio or size something should be, or runs any of the repo's image scripts — even when they only say "make me a nice photo of X" and name no placement. It settles placement and aspect ratio first, writes a structured prompt, generates several candidates, screens them against a failure checklist, refines globally or locally, and exports only the finalist at the dimensions the component actually needs. It also carries Quoin's non-negotiable rules for generated imagery, so read it before writing any image prompt or touching src/lib/images/generator.ts.
---

# Image brief

## What this is for

Almost no bad image in a storefront is a rendering failure. The model
usually draws a competent picture; it is the wrong shape, or the subject
sits exactly where the price has to go, or it looks like a photograph of
a SKU nobody has ever photographed. Those are briefing failures, and
they are all cheap to avoid before spending a generation and expensive to
fix after.

So the order below is not ceremony. Each step exists because skipping it
produces a specific, recurring kind of waste.

## Step 0 — Pick the route

This repo already generates images in two places, both of them
opinionated. Reaching for an ad-hoc model call when one of these fits
produces an asset that is unlabelled, the wrong size, and outside the
resumable pipeline.

| What is being asked for | Route |
| --- | --- |
| A catalogue picture for SKUs that have none | `npx tsx scripts/generate-product-images.ts --dry-run` first, then for real. The prompt is built by `buildPrompt` in [src/lib/images/generator.ts](../../../src/lib/images/generator.ts) — improve `CATEGORY_HINT` / `UNIT_HINT` there rather than hand-writing a prompt per SKU, because 411 SKUs still have no image and per-SKU prompts do not scale. |
| A room for the Studio feed | `npx tsx scripts/generate-studio-images.ts`, portrait `1024x1536`, then `prisma/seed-studio.ts` reads the manifest. Tags must stay inside the existing vocabulary or the filter rail offers a facet nothing matches. |
| A one-off asset — hero, promo, category tile, nav thumbnail, social or ad crop, something for a deck | OpenArt MCP. See [references/openart.md](references/openart.md) for model choice, credits and reference images. |

Two standing facts about cost. The repo's scripts are resumable and
**never regenerate an existing image, because every regeneration is
money** — don't defeat that with the Studio script's `--force` unless the
user asked for a redo. And OpenArt bills per generation, so read the
balance rather than assuming it: when this skill was written it sat below
every image model's price, and the honest answer then is the price, the
balance, and an offer to have the brief ready.

## Step 1 — Define the job, not the subject

Three answers exist before a prompt does:

- **Placement.** Which component, on which page. "A product hero for the
  PDP gallery" is actionable; "a nice product photo" is not.
- **Feeling.** Quoin's register is a working builder's merchant — plain,
  well-lit, unfussy. Luxury gloss and playful staging both read as a
  different shop.
- **Ratio.** See the next step; lock it here.

If the user named none of these, infer from the ask, state the assumption
in one line, and proceed. Don't block on it — but don't silently pick
either, because a wrong placement guess wastes the whole chain below.

## Step 2 — Lock the aspect ratio first

Cropping is destructive: a composition framed 16:9 and rendered into a
square loses the edges the composition was about, and `object-cover`
crops from the centre without asking. Deciding the ratio last means
discovering this after the finalist is upscaled.

These are the ratios the storefront actually reserves. `Photo` takes
`ratio` and `sizes` and both are required — the box is reserved before
the bytes arrive so the grid doesn't reflow.

| Placement | Ratio | Where |
| --- | --- | --- |
| Product card, PDP gallery, wishlist, recently-viewed | `1 / 1` | [ProductCard.tsx:143](../../../src/components/storefront/ProductCard.tsx#L143), [product/Gallery.tsx:36](../../../src/components/storefront/product/Gallery.tsx#L36) |
| Home hero panel | `4 / 3` | [home/Hero.tsx:152](../../../src/components/storefront/home/Hero.tsx#L152) |
| Studio idea tile, idea masonry, StudioRow, Rooms (desktop) | `4 / 5` | [home/StudioRow.tsx:38](../../../src/components/storefront/home/StudioRow.tsx#L38), [studio/IdeaFeed.tsx:85](../../../src/components/storefront/studio/IdeaFeed.tsx#L85) |
| Rooms rail (mobile), promo panel (mobile) | `3 / 2` | [home/Rooms.tsx:75](../../../src/components/storefront/home/Rooms.tsx#L75), [home/Promos.tsx:87](../../../src/components/storefront/home/Promos.tsx#L87) |
| Spaces grid tile | `4 / 3` | [studio/SpacesGrid.tsx:238](../../../src/components/storefront/studio/SpacesGrid.tsx#L238) |
| Category tile | `RATIO` map | [CategoryTile.tsx:63](../../../src/components/storefront/CategoryTile.tsx#L63) — read it, it varies by variant |
| Nav thumbnail | square, one size | `scripts/build-nav-thumbnails.ts` trims then covers to `SIZE` |

A placement that renders at two ratios across breakpoints (Rooms,
Promos) needs a subject that survives both crops — keep it off the edges
rather than generating twice.

## Step 3 — Write the prompt in six slots

Filling all six is what separates a prompt from a wish. Missing slots get
filled by the model's defaults, which is where dramatic side-lighting and
invented logos come from.

1. **Subject** — what the thing is, in the plainest words. For catalogue
   work this is the *category*, not the SKU.
2. **Environment** — plain white sweep, a real kitchen, a site.
3. **Style** — photographic or illustrated, and how finished.
4. **Lighting** — direction, hardness, one source or two.
5. **Composition** — framing, where the subject sits, what is in frame.
6. **Constraints** — required in-image text, and where the negative space
   for copy must be. Say what must *not* appear too.

**Withhold the brand and the model number.** Asking for "a Jaquar
CON-CHR-047" invites the model to invent branding and a form factor it
knows nothing about, producing something that looks like a real product
photograph and is wrong in every detail. That is the exact failure mode
that makes generated catalogue imagery risky, and `buildPrompt` is built
around avoiding it.

**Example — promo panel, mobile `3 / 2`, copy over the left third:**

> Photograph of a soft-close cabinet hinge and a drawer runner resting on
> a pale birch worktop — builder's hardware, brushed steel. Daylight from
> the upper right, single source, soft shadows. Subject in the right
> third, seen at a slight angle; the left third is empty worktop. No
> text, no logos, no branding, no watermark, no people, no packaging
> labels. Photorealistic, 3:2 landscape.

## Step 4 — Generate candidates before refining anything

Ask for two to four renders of the same brief and pick a composition
baseline first. Refining a weak composition is the most common way to
spend five generations arriving somewhere a fresh candidate would have
started. Picking is cheap; fixing is not.

## Step 5 — Screen against the failure checklist

Run this before showing the user anything. It catches what a quick glance
at a plausible-looking image does not:

- **Is the subject actually the thing?** A "bend" that is a road, a
  "chakka" that is a wheel. Terse catalogue names are ambiguous outside
  the trade, which is what the category hint exists to fix.
- **Is there invented branding?** Any logo, model number or label the
  model made up is a defect, not a flourish.
- **Is the lighting consistent?** One light direction. Two shadow
  directions on one object is the giveaway that reads as fake.
- **Are the fiddly details intact?** Hands, hinge leaves, screw threads,
  grout lines, weave and tile repeats, and any text. These are where
  these models still fail, and hardware is nothing but fiddly detail.
- **Is the negative space where the copy goes?** Check it against the
  real component, not against the intention.
- **Does the crop survive?** Mentally apply `object-cover` at the ratio
  from Step 2 — and at both ratios for a responsive placement.
- **Does it read at the rendered size?** A nav thumbnail is tiny; a
  picture whose subject is a third of the frame becomes a smudge, which
  is why `build-nav-thumbnails.ts` trims before covering.

## Step 6 — Refine in one of two modes, deliberately

Naming the mode keeps you from rewriting a prompt that was already right.

- **Global** — the style, mood, framing or lighting is wrong. Rewrite the
  prompt slots and regenerate. Change one slot at a time; changing three
  tells you nothing about which one worked.
- **Local** — the picture is right and one region is broken. Inpaint just
  that region, or outpaint to extend the canvas when you need more
  negative space than you framed. Don't regenerate the whole image for a
  bad hinge leaf; you will lose the parts you liked.

## Step 7 — Export at the size the component needs

Only the finalist gets upscaled — upscaling every candidate is paying for
pictures you already rejected.

The repo's conventions, worth matching so a new asset behaves like the
existing ones:

- **WebP at quality 82.** A PNG is about 2MB and the same picture as WebP
  is a tenth of that.
- **A 16px blur placeholder at quality 40**, inlined as a data URI, so
  something is painted while the image loads.
- **Files under `public/`**, where the path is also the public URL.
- **Set `imageIsGenerated: true`** on anything a model made. See below.
- **Pass `ratio` and `sizes`** to `Photo`. Without `sizes` every tile
  downloads the original.

## The rules that are not negotiable

These are load-bearing in the schema and the storefront, not preferences.

- **A generated picture of a real SKU is labelled an illustration.**
  `imageIsGenerated` drives that label. Writing a generated image without
  the flag tells a customer they will receive something nobody has
  photographed — it is the difference between an illustrated catalogue
  and a misleading one.
- **A manufacturer's photograph clears the flag, and only a real
  photograph may.** See `src/app/api/v1/admin/products/[sku]/image/route.ts`.
- **`sourceImageUrl` and the other `source*` fields are quarantined.**
  They record what a competitor showed. Never render them, never treat
  them as Quoin imagery.
- **Studio imagery is generated because the alternative is theft.** Quoin
  owns no interiors photography, and a feed scraped off Pinterest or
  lifted from a design firm's portfolio is the most obviously stolen
  thing a storefront could publish. Don't "improve" the feed by sourcing
  real photographs from the web.
- **The Studio feed is finished rooms.** `StudioIdeaKind` defaults to the
  exclusive value on purpose: a product shot stays out until a person
  says it is a room.
- **Say what the picture is, never what it guarantees.** Take a layout
  from a reference; never take its claims, badges or discounts.
