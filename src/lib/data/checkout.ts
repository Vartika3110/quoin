import { db } from "@/lib/db";
import { resolveVariantPrice, type Paise } from "@/lib/types/catalog";
import { normalizeQty } from "@/lib/cart/quantity";

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
 * The quote tells the customer tax is added on the invoice, which is
 * true, and which is also the statement that makes catalogue prices
 * tax-*exclusive*. See the note on `taxForLine` — it matters, because
 * Indian MRPs are inclusive by law and a price imported from one without
 * the tax stripped would be taxed twice.
 */

export interface QuoteLineInput {
  productSlug: string;
  variantId: string;
  qty: number;
}

export type QuoteIssue =
  | "unavailable"
  | "price_changed"
  | "quantity_adjusted";

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
        select: { slug: true, name: true, fulfilment: true },
      },
    },
  });

  const byId = new Map(variants.map((v) => [v.id, v]));

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
