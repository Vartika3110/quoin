import type { Product } from "@/lib/types/catalog";

/**
 * Which products can be shown in a customer's room, and which cannot.
 *
 * Its own module, with no server imports at all, because both halves need
 * the same answer: the product page decides whether to render the button,
 * and `POST /api/v1/visualise` decides whether to spend money on the
 * request. Two copies of this rule would eventually disagree, and the way
 * that surfaces is a visible button that returns an error.
 *
 * **Services are out**, which is the one exclusion the brief states
 * outright. A service is somebody's time — there is nothing to place in a
 * photograph, and a render of "Plumbing" would be an illustration of a
 * tradesperson who does not exist standing in the customer's kitchen.
 *
 * Services are identified by what the catalogue already records rather
 * than by a new flag, and by three signals rather than one, because no
 * single one of them is reliable on its own:
 *
 *  - `BOOKABLE` — the schema defines it as "No stock at all. Consumes a
 *    professional's time slot".
 *  - `PER_VISIT` — how a visit is priced.
 *  - the `services` department, which this catalogue really has.
 *
 * Any one of the three is enough to exclude a row. Everything else —
 * materials, fittings, Architectural Selects, lighting — is in, which is
 * what the brief asks for.
 */
export function canVisualise(
  product: Pick<Product, "fulfilment" | "pricingUnit">,
  categorySlug?: string | null,
): boolean {
  if (product.fulfilment === "bookable") return false;
  if (product.pricingUnit === "per_visit") return false;
  if (categorySlug === "services") return false;
  return true;
}

/**
 * The placement to offer first, guessed from the department.
 *
 * A guess, and the customer can change it — but the right default is most
 * of the value: somebody on a tile page wants the floor, and making them
 * choose from five options before seeing anything is a form standing in
 * front of a feature.
 *
 * Keyed on the real category slugs this catalogue uses. An unknown slug
 * falls through to `in_place`, which is the one placement that is never
 * wrong, only vaguer.
 */
export function defaultPlacement(categorySlug: string | null | undefined): string {
  switch (categorySlug) {
    case "tiling-adhesives":
      return "floor";
    case "paints-finishes":
    case "plywood-laminates":
    case "waterproofing":
      return "wall";
    case "gypsum-false-ceiling":
      return "ceiling";
    case "kitchen-sinks-faucets":
      return "worktop";
    default:
      /* Bathware, electricals and lighting, hardware, appliances,
         furniture fittings — all of them are a thing that goes somewhere
         specific, which is exactly what `in_place` means. */
      return "in_place";
  }
}
