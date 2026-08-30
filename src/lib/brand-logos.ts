/**
 * Manufacturer artwork, keyed by brand slug.
 *
 * A brand's logo is its trademark, and showing one is a claim about a
 * relationship — so a mark appears on the storefront only once we hold
 * both the file and the right to display it. Entries point at files under
 * `public/brands/`; SVG, since these are drawn at every size from a
 * 24px-tall plate upward.
 *
 * Deliberately an explicit map rather than a guess at
 * `/brands/${slug}.svg`: a slug with no file behind it would render as a
 * broken image on the home page, and every brand the importer invents —
 * `Generic`, `Local` — would ask for one.
 *
 * Brands absent from this map are named in type instead, which is honest
 * about what we have and legible either way.
 */
export const BRAND_LOGOS: Record<string, string> = {
  /* Cropped from the cover of Jaquar's own customer guide. The wordmark
     alone, not the full lockup: the plate gives a mark 24px of height, and
     the stacked version is nearly square, so it would land narrower than
     the brand names set in type beside it. */
  jaquar: "/brands/jaquar.png",
  /* From the running header of Ozone's own catalogue, where the mark is
     printed positive on white. The cover carries it too, but knocked out
     in white on blue — invisible on a white plate. */
  ozone: "/brands/ozone.png",
};
