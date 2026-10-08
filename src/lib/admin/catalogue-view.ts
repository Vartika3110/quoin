import type { Fulfilment, PricingUnit } from "@prisma/client";

/**
 * What the catalogue tools *render* — the shapes and the words, with no
 * way to reach a database.
 *
 * Split from `src/lib/data/catalog-admin.ts` for one concrete reason: the
 * register's rows are a client component, and it needs two of these label
 * maps at runtime. Importing them from the data module pulled `db` and
 * `env` into the browser bundle along with them, where `env` validates
 * `DATABASE_URL` and `AUTH_SECRET`, finds neither, and throws — so the
 * page rendered on the server and then blanked on hydration.
 *
 * Types alone would have been safe, because `import type` is erased. A
 * runtime value is not, so anything a client component actually *uses*
 * has to live here, where the only import is type-only.
 */

/** Whether the storefront will show a product, and if not, why not. */
export type CatalogueStatus =
  /** Active, with something sellable. Visible in the shop. */
  | "live"
  /** Active, but no variant at all — the `/admin/pricing` queue. */
  | "unpriced"
  /**
   * Active and priced, but every variant is switched off, so the
   * storefront still will not show it.
   *
   * Nothing in the app deactivates a variant today, so this is currently
   * unreachable — it is here because the alternative is folding it into
   * `unpriced`, and a row labelled "no price" that is showing a price is
   * the kind of thing someone stops trusting the whole screen over.
   */
  | "hidden"
  /** Switched off by hand. Kept, so it can be switched back on. */
  | "retired";

export interface CatalogueVariant {
  id: string;
  sku: string;
  label: string;
  mrpPaise: number;
  pricePaise: number;
  proPricePaise: number | null;
  minQty: number;
  stepQty: number;
  isActive: boolean;
  /** Counted-in stock exists for this variant, so a hard delete is refused. */
  stockedItems: number;
}

export interface CatalogueProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  status: CatalogueStatus;
  photo?: string;
  /** Swatch key for `ProductImage`, drawn when there is no photograph. */
  swatch: string;
  fulfilment: Fulfilment;
  pricingUnit: PricingUnit;
  gstRatePct: number;
  stockTracked: boolean;
  variants: CatalogueVariant[];
  /**
   * How many order lines name this product.
   *
   * Shown before a permanent delete is confirmed. It is not a blocker:
   * `OrderLine` holds no foreign key to the catalogue precisely so that a
   * sale keeps saying what was bought after the SKU stops existing — see
   * the model comment. But "this has been sold 42 times" is the single
   * most useful fact to put in front of someone about to delete a row,
   * and nothing else on the screen carries it.
   */
  orderLines: number;
}

/**
 * The enums, in the words staff use for them.
 *
 * Exhaustive `Record`s keyed by the Prisma enum rather than by the wire
 * spelling, for the reason the storefront's three lookup tables are: a
 * value added to the schema and not handled here is a type error instead
 * of a blank cell. These read differently from the storefront's labels on
 * purpose — a merchandiser wants "Per sq.ft.", a product card wants the
 * terse "/sq.ft." that fits beside a price.
 */
export const FULFILMENT_LABEL: Record<Fulfilment, string> = {
  INSTANT: "Instant",
  SCHEDULED: "Scheduled",
  BOOKABLE: "Bookable",
  MADE_TO_ORDER: "Made to order",
};

export const UNIT_LABEL: Record<PricingUnit, string> = {
  PER_PIECE: "Per piece",
  PER_SQFT: "Per sq.ft.",
  PER_RUNNING_FT: "Per running ft.",
  PER_VISIT: "Per visit",
  PER_BAG: "Per bag",
  PER_LITRE: "Per litre",
  PER_KG: "Per kg",
};
