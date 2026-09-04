import { Info } from "@/components/icons";
import {
  PRICING_UNIT_LABEL,
  type Product,
} from "@/lib/types/catalog";

/**
 * The specification table.
 *
 * Every row here is a field the catalogue actually holds. The brief asks
 * for coverage, dimensions, material, finish, pack size, weight and
 * suitable surfaces — none of which exist on `Product`, because the
 * importer reads manufacturer price lists rather than datasheets. Printing
 * "Material: —" fourteen times looks like a spec table and tells the
 * customer nothing; printing invented values is worse than either.
 *
 * So the table shows what is known, and the note underneath says plainly
 * what is not and why. A professional deciding between two SKUs gets more
 * from an honest gap than from a full-looking table they cannot trust.
 */
export function Specs({
  product,
  categoryTitle,
}: {
  product: Product;
  categoryTitle?: string;
}) {
  const variant = product.variants[0];

  const rows: { label: string; value: string }[] = [
    ...(product.brand ? [{ label: "Brand", value: product.brand }] : []),
    ...(categoryTitle ? [{ label: "Category", value: categoryTitle }] : []),
    { label: "SKU", value: variant.sku },
    { label: "Sold by", value: PRICING_UNIT_LABEL[product.pricingUnit].replace(/^\//, "per ") },
    {
      label: "Minimum order",
      value: `${variant.minQty} ${unitNoun(product)}`,
    },
    ...(variant.stepQty > 1
      ? [{ label: "Order increments", value: `${variant.stepQty} ${unitNoun(product)}` }]
      : []),
    ...(product.variants.length > 1
      ? [
          {
            label: "Options",
            value: product.variants.map((v) => v.label).join(", "),
          },
        ]
      : []),
    ...(product.leadTimeDays
      ? [{ label: "Lead time", value: `${product.leadTimeDays} days` }]
      : []),
  ];

  return (
    <div>
      <dl className="divide-y divide-line-hair overflow-hidden rounded-card border border-line-soft">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-4 bg-surface px-4 py-3"
          >
            <dt className="text-caption text-muted">{row.label}</dt>
            <dd className="nums min-w-0 text-body-sm text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 flex items-start gap-2 text-micro leading-relaxed text-faint">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Dimensions, finish, coverage and material are published as each
        manufacturer&rsquo;s datasheet is imported. Ask an expert if you need a
        figure before then — they can read it off the technical catalogue.
      </p>
    </div>
  );
}

/** What one unit of this product is called, for the quantity rows. */
function unitNoun(product: Product): string {
  switch (product.pricingUnit) {
    case "per_sqft":
      return "sq.ft.";
    case "per_running_ft":
      return "running ft.";
    case "per_bag":
      return "bags";
    case "per_litre":
      return "litres";
    case "per_kg":
      return "kg";
    case "per_visit":
      return "visit";
    default:
      return "pieces";
  }
}
