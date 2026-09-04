import { formatPrice } from "@/lib/types/catalog";
import type { ProjectSummary } from "@/lib/store/projects";

/**
 * The budget, as one bar.
 *
 * Three segments — committed, planned, and what is left — because those
 * are three genuinely different states and a single "spent" figure hides
 * the middle one. A customer with ₹3L committed and ₹2L sitting in a
 * material list they have not ordered is not in the same position as one
 * with ₹3L committed and nothing planned, and a two-segment bar says they
 * are.
 *
 * Drawn with CSS rather than a chart library: three widths and a legend
 * do not justify 40kB of JavaScript, and the bar has to render on the
 * server anyway.
 */
export function BudgetBar({ summary }: { summary: ProjectSummary }) {
  const { budgetPaise, spentPaise, plannedPaise } = summary;

  /* Over budget, the bar is scaled to the commitment rather than the
     budget — otherwise the overspend is simply invisible, which is the one
     thing this component exists to prevent. */
  const scale = Math.max(budgetPaise, spentPaise + plannedPaise, 1);
  const pct = (paise: number) => `${Math.min(100, (paise / scale) * 100)}%`;
  const remaining = Math.max(0, budgetPaise - spentPaise - plannedPaise);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-caption text-muted">Budget</span>
        <span className="nums text-body-sm font-semibold text-ink">
          {formatPrice(budgetPaise)}
        </span>
      </div>

      <div
        className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-sunk"
        role="img"
        aria-label={`${formatPrice(spentPaise)} committed and ${formatPrice(
          plannedPaise,
        )} planned against a budget of ${formatPrice(budgetPaise)}`}
      >
        <span
          style={{ width: pct(spentPaise) }}
          className="h-full bg-accent transition-[width] duration-500 ease-out-quart"
        />
        <span
          style={{ width: pct(plannedPaise) }}
          /* Hatched rather than a second flat colour: "planned" is not a
             smaller amount of "spent", it is a different kind of number,
             and the texture says so without adding a fourth hue. */
          className="h-full bg-accent/35 transition-[width] duration-500 ease-out-quart"
        />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Legend swatch="bg-accent" label="Committed" value={formatPrice(spentPaise)} />
        <Legend swatch="bg-accent/35" label="Planned" value={formatPrice(plannedPaise)} />
        <Legend
          swatch="bg-sunk"
          label={summary.overBudget ? "Over" : "Left"}
          value={formatPrice(
            summary.overBudget ? spentPaise - budgetPaise : remaining,
          )}
          tone={summary.overBudget ? "danger" : undefined}
        />
      </dl>
    </div>
  );
}

function Legend({
  swatch,
  label,
  value,
  tone,
}: {
  swatch: string;
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-micro text-muted">
        <span className={`size-2 shrink-0 rounded-full ${swatch}`} aria-hidden />
        {label}
      </dt>
      <dd
        className={`nums mt-0.5 text-body-sm font-semibold ${
          tone === "danger" ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
