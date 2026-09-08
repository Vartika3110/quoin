import { Progress } from "@/components/ui/Progress";
import { Card } from "@/components/ui/Card";
import { formatPrice } from "@/lib/types/catalog";
import type { SpaceItemView } from "@/lib/types/studio";
import { summariseItems } from "@/lib/types/studio";

/**
 * What this room is going to cost.
 *
 * Every figure is derived from the items, on every render. Nothing is
 * stored — the rule `summarise` already established for projects, and the
 * reason it matters is that a budget with its own "spent" column drifts
 * from the lines that made it and then nobody trusts either number.
 *
 * Section 17 asks for "a simple visual progress indicator" and explicitly
 * not charts, so this is one bar and four numbers. The bar is only drawn
 * when a budget has actually been set: a progress bar against a target of
 * zero is either a divide-by-zero or a permanently full bar, and both are
 * worse than no bar.
 */
export function SpaceBudget({
  items,
  budgetPaise,
}: {
  items: SpaceItemView[];
  budgetPaise: number;
}) {
  const totals = summariseItems(items);

  const products = items
    .filter((i) => i.kind === "product")
    .reduce((sum, i) => sum + Math.round(i.qty * i.unitPricePaise), 0);
  const materials = items
    .filter((i) => i.kind === "material")
    .reduce((sum, i) => sum + Math.round(i.qty * i.unitPricePaise), 0);

  const remaining = budgetPaise - totals.plannedPaise;
  const over = remaining < 0;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card padding="lg" className="flex flex-col gap-4">
        <div>
          <p className="text-eyebrow uppercase text-faint">Planned</p>
          <p className="nums mt-1 text-headline font-semibold text-ink">
            {formatPrice(totals.plannedPaise)}
          </p>
        </div>

        {budgetPaise > 0 ? (
          <>
            <Progress
              value={Math.min(totals.plannedPaise, budgetPaise)}
              max={budgetPaise}
              /* Turns when the plan passes the budget, which is the one
                 moment this bar has something to say. */
              tone={over ? "danger" : "accent"}
              label="Budget used"
            />

            <div className="flex justify-between gap-4 text-body-sm">
              <span className="text-muted">
                Budget <span className="nums text-ink">{formatPrice(budgetPaise)}</span>
              </span>
              <span className={over ? "text-danger" : "text-success"}>
                {over ? "Over by " : "Left "}
                <span className="nums font-medium">
                  {formatPrice(Math.abs(remaining))}
                </span>
              </span>
            </div>
          </>
        ) : (
          <p className="text-body-sm text-faint">
            No budget set for this room yet. Add one and this becomes a
            running total against it.
          </p>
        )}
      </Card>

      <dl className="grid grid-cols-2 gap-3">
        <Line label="Products" count={totals.products} paise={products} />
        <Line label="Materials" count={totals.materials} paise={materials} />
      </dl>

      <p className="text-caption text-faint">
        {/* Says what it is, so nobody mistakes a plan for a quotation.
            Delivery, GST treatment and Pro pricing are all settled at
            checkout, not here. */}
        A plan, not a quotation. Prices are the standard tier as shown in the
        catalogue today.
      </p>
    </div>
  );
}

function Line({
  label,
  count,
  paise,
}: {
  label: string;
  count: number;
  paise: number;
}) {
  return (
    <Card tone="sunk" padding="md">
      <dt className="text-caption text-faint">
        {label} <span className="nums">({count})</span>
      </dt>
      <dd className="nums mt-0.5 text-title-sm font-semibold text-ink">
        {formatPrice(paise)}
      </dd>
    </Card>
  );
}
