# Generating a one-off asset with OpenArt

Read this only for assets outside the repo's two pipelines — a hero, a
promo panel, a category tile, a social crop, something for a deck. For
catalogue SKUs and Studio rooms, use the scripts named in SKILL.md
Step 0.

## The call sequence

1. `openart_model_list` — also tells you the balance and which modes are
   `affordable`. **Check this before promising an image.** Nothing is
   affordable at 5 credits, and the honest move then is to say the price
   and the balance, pass on `upgradeUrl` verbatim, and offer to write the
   brief so it is ready when credits are there.
2. `openart_model_form_get` with the chosen model and mode — the fields
   differ per model, including how the aspect ratio is named.
3. `openart_generate_image` with the fully-written prompt.

Results come back `PENDING`. This host shows a self-polling result card,
so say the render is underway and end the turn rather than polling.

## Choosing a model

Match the model to the job rather than reaching for the most expensive
one:

- **In-image text that has to be correct** (a poster, an ad with a
  tagline) — Nano Banana Pro is the specialist; GPT Image 2.5 Sunburst is
  the other precise-text option.
- **Product hero aesthetics, photoreal** — GPT Image 2 / 2.5 (Flare for
  speed, Sunburst for quality).
- **Editing an image that already exists** — Grok Imagine Image 2.0 is
  built for region-targeted edits, background removal, and Smart Resize
  to re-frame into another aspect ratio. That last one is the cheap fix
  for "this is the right picture at the wrong ratio".
- **Cost-conscious, 1K is enough** — Nano Banana 2 Lite, Seedream 5 Lite,
  Kling 3 Omni.
- **Illustration or anime over photorealism** — the Seedream family.

Ratio is a first-class parameter on most of these, so ask for the
placement's ratio directly instead of generating square and cropping.

## Reference images

To carry a subject, a palette or a layout across from an existing
picture, use `image2image` and supply references. In this host, open
`openart_upload_pick` and wait for the upload to finish — don't go
hunting in attachment directories or search `openart_upload_list` for it.

A reference is also the honest way to keep a generated asset consistent
with imagery Quoin already owns — `public/categories/`, `public/nav/`, `public/catalogue/`, `public/hero/` — rather
than drifting into a different-looking shop every time.

## What not to do with it

- Don't generate a picture of a specific SKU here and write it to
  `Product.image` by hand — that path exists as a script, and the flag
  and the label come with it.
- Don't use it to reproduce a brand's own product photography, packaging
  or logo from a description. Withholding the brand is the rule in
  SKILL.md Step 3, and it applies here too.
