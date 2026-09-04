/**
 * The manufacturers Quoin stocks, in the order they appear on the wall.
 *
 * A brand's logo is its trademark, and showing one is a claim about a
 * relationship — so a mark appears on the storefront only once we hold
 * both the file and the right to display it. Entries point at files under
 * `public/brands/`.
 *
 * Deliberately an explicit ordered list rather than a guess at
 * `/brands/${slug}.png`: a slug with no file behind it would render as a
 * broken image, and every brand the importer invents — `Generic`,
 * `Local` — would ask for one. It is also not derived from the catalogue,
 * because the wall says who we buy from, which is a different claim from
 * who happens to have the most rows imported this week.
 *
 * The wall is artwork only, no names set in type: a mark nobody supplied
 * is a line missing from this list, not a text fallback.
 */
export const BRAND_WALL: readonly { slug: string; name: string; logo: string }[] = [
  /* Fittings and hardware first — the lines the catalogue is deepest in. */
  { slug: "hettich", name: "Hettich", logo: "/brands/hettich.png" },
  { slug: "hafele", name: "Häfele", logo: "/brands/hafele.png" },
  { slug: "ebco", name: "Ebco", logo: "/brands/ebco.png" },
  { slug: "dorset", name: "Dorset", logo: "/brands/dorset.png" },
  { slug: "ozone", name: "Ozone", logo: "/brands/ozone.png" },
  /* Bath. */
  { slug: "jaquar", name: "Jaquar", logo: "/brands/jaquar.png" },
  /* Then the structural materials. */
  { slug: "ultratech", name: "UltraTech Cement", logo: "/brands/ultratech.png" },
  { slug: "ambuja", name: "Ambuja Cement", logo: "/brands/ambuja.png" },
  { slug: "somany", name: "Somany", logo: "/brands/somany.png" },
  /* Finishes. */
  { slug: "asian-paints", name: "Asian Paints", logo: "/brands/asian-paints.png" },
  { slug: "berger", name: "Berger Paints", logo: "/brands/berger.png" },
  /* Electricals. */
  { slug: "polycab", name: "Polycab", logo: "/brands/polycab.png" },
  { slug: "havells", name: "Havells", logo: "/brands/havells.png" },
  /* The house brand, last: it is ours, so it does not vouch for us. */
  { slug: "mars", name: "Mars", logo: "/brands/mars.png" },
];
