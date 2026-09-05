import { db } from "@/lib/db";
import { resolveVariantPrice, type Paise } from "@/lib/types/catalog";
import { normalizeQty } from "@/lib/cart/quantity";
import { availableQty, isStockBearing } from "@/lib/data/inventory";

/**
 * Re-pricing a cart, server-side.
 *
 * The browser holds a snapshot of what each line cost when it was added.
 * That snapshot is for drawing the cart quickly and for nothing else: it
 * can be days old, it can have been edited by anyone with dev tools open,
 * and the catalogue moves underneath it. So before any money is discussed,
 * every line is looked up again here and priced with the same
 * `resolveVariantPrice` the product page used.
 *
 * What comes back is not just a total — it is a diff. A line whose price
 * changed, whose variant was retired, or whose quantity no longer sits on
 * the sellable grid is reported as such, so the customer is shown the
 * change before they agree to it rather than after they have paid.
 *
 * GST is deliberately absent *here*, and that is a scoping decision
 * rather than a missing column: `Product.gstRatePct` holds the slab, set
 * per category by the importer. A quote is a pricing answer — "what does
 * this basket cost" — and it is served to guests, where a tax breakdown
 * is noise. Tax is computed once, at the point it becomes an invoice
 * line, by `taxForLine` in `src/lib/data/orders.ts`, and frozen onto the
 * order there.
 *
 * Catalogue prices are tax-*inclusive* — see the note on `taxForLine` —
 * so `subtotalPaise` below is already the full amount the customer pays
 * for the lines; `taxForLine` extracts the GST *contained in* it for the
 * invoice rather than adding anything on top.
 */

export interface QuoteLineInput {
  productSlug: string;
  variantId: string;
  qty: number;
}

export type QuoteIssue =
  | "unavailable"
  | "price_changed"
  | "quantity_adjusted"
  /* Only ever set for a `Product.stockTracked` line — see
     `src/lib/data/inventory.ts`. An untracked line is sold exactly as it
     is today and never carries this issue, however few of it there are. */
  | "out_of_stock";

export interface QuoteLine {
  productSlug: string;
  variantId: string;
  title: string;
  variantLabel: string;
  /** What the customer asked for. */
  requestedQty: number;
  /** What is actually sellable — snapped onto the variant's grid. */
  qty: number;
  unitPricePaise: Paise;
  mrpPaise: Paise | null;
  linePaise: Paise;
  fulfilment: string;
  issues: QuoteIssue[];
}

export interface Quote {
  lines: QuoteLine[];
  /** Lines that could not be priced at all, by slug. */
  unavailable: { productSlug: string; variantId: string }[];
  subtotalPaise: Paise;
  savingsPaise: Paise;
  /** True when anything moved since the browser last looked. */
  changed: boolean;
}

export async function quoteCart(
  input: QuoteLineInput[],
  isPro: boolean,
): Promise<Quote> {
  if (input.length === 0) {
    return {
      lines: [],
      unavailable: [],
      subtotalPaise: 0,
      savingsPaise: 0,
      changed: false,
    };
  }

  /* One query for every variant asked about, rather than one per line. A
     twenty-line cart should not be twenty round trips to the database
     region before a total can be shown. */
  const variants = await db.productVariant.findMany({
    where: {
      id: { in: input.map((l) => l.variantId) },
      isActive: true,
      product: { isActive: true },
    },
    select: {
      id: true,
      label: true,
      sku: true,
      mrpPaise: true,
      pricePaise: true,
      proPricePaise: true,
      minQty: true,
      stepQty: true,
      product: {
        select: { slug: true, name: true, fulfilment: true, stockTracked: true },
      },
    },
  });

  const byId = new Map(variants.map((v) => [v.id, v]));

  /* Availability, for the variants where it is a real question. Summed
     across every store rather than resolved to one: `quoteCart` has no
     delivery address to resolve a store from — that only happens at
     order creation, in `reserveStockForOrder` — so this is an early,
     advisory signal for the cart to show, not the gate. The gate is the
     conditional reserve at order creation; a line that clears here can
     still fail there if the customer's specific address cannot be served
     at all, and a line that shows `out_of_stock` here is never let
     through there either way. */
  const trackedVariantIds = variants
    .filter((v) => v.product.stockTracked && isStockBearing(v.product.fulfilment))
    .map((v) => v.id);

  const availableByVariant = new Map<string, number>();
  if (trackedVariantIds.length > 0) {
    const totals = await db.inventoryItem.groupBy({
      by: ["variantId"],
      where: { variantId: { in: trackedVariantIds } },
      _sum: { onHandQty: true, reservedQty: true },
    });
    for (const row of totals) {
      availableByVariant.set(
        row.variantId,
        availableQty(row._sum.onHandQty ?? 0, row._sum.reservedQty ?? 0),
      );
    }
  }

  const lines: QuoteLine[] = [];
  const unavailable: Quote["unavailable"] = [];

  for (const wanted of input) {
    const row = byId.get(wanted.variantId);

    /* Gone, retired, or never existed — and the product slug is checked
       too, so a variant id lifted from another product cannot be used to
       buy it under a cheaper product's name. */
    if (!row || row.product.slug !== wanted.productSlug) {
      unavailable.push({
        productSlug: wanted.productSlug,
        variantId: wanted.variantId,
      });
      continue;
    }

    const price = resolveVariantPrice(
      {
        id: row.id,
        label: row.label,
        mrp: row.mrpPaise,
        price: row.pricePaise,
        proPrice: row.proPricePaise ?? undefined,
        sku: row.sku,
        minQty: row.minQty,
        stepQty: row.stepQty,
      },
      isPro,
    );

    const qty = normalizeQty(row, wanted.qty);
    const issues: QuoteIssue[] = [];
    if (qty !== wanted.qty) issues.push("quantity_adjusted");

    if (row.product.stockTracked && isStockBearing(row.product.fulfilment)) {
      const available = availableByVariant.get(row.id) ?? 0;
      if (available < qty) issues.push("out_of_stock");
    }

    lines.push({
      productSlug: row.product.slug,
      variantId: row.id,
      title: row.product.name,
      variantLabel: row.label,
      requestedQty: wanted.qty,
      qty,
      unitPricePaise: price.amount,
      mrpPaise: price.strikethrough,
      linePaise: price.amount * qty,
      fulfilment: row.product.fulfilment,
      issues,
    });
  }

  const subtotalPaise = lines.reduce((sum, l) => sum + l.linePaise, 0);
  const savingsPaise = lines.reduce(
    (sum, l) => sum + (l.mrpPaise ? (l.mrpPaise - l.unitPricePaise) * l.qty : 0),
    0,
  );

  return {
    lines,
    unavailable,
    subtotalPaise,
    savingsPaise,
    changed: unavailable.length > 0 || lines.some((l) => l.issues.length > 0),
  };
}
