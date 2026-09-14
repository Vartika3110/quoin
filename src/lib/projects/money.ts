import type { OrderStatus, ServiceBookingStatus } from "@prisma/client";
import { moneyMoved } from "@/lib/orders/status-groups";
import { bookingCommitsMoney } from "@/lib/services/booking-status";

/**
 * A project's money, derived — never stored.
 *
 * One function for the project page and the account dashboard, because the
 * two used to be one screen apart and could not be allowed to disagree about
 * what "spent" means. Pure and client-safe.
 *
 * The four figures are different kinds of number, not slices of one:
 *
 *  - **Spent** — orders filed under the project whose money has actually
 *    moved (`moneyMoved`). The order is the source of truth; nothing is
 *    copied onto the project.
 *  - **Committed** — agreed but not paid through Quoin's checkout: material
 *    lines the customer marked ordered or delivered (bought elsewhere, or
 *    tracked by hand) and service quotes they accepted.
 *  - **Planned** — priced material lines not yet ordered. Shown, never
 *    subtracted: a plan is not spend.
 *  - **Remaining** — budget less spent and committed. Negative when over,
 *    and shown negative; clamping it to zero hides the number that matters.
 *
 * A material line typed by hand for goods that were also bought in a filed
 * order will count twice — once as spent, once as committed. That is the
 * customer's own double entry, and the page says how each figure is made
 * rather than guessing which lines are the same goods.
 */

export interface MoneyInput {
  budgetPaise: number;
  orders: { status: OrderStatus; totalPaise: number }[];
  materials: { status: "planned" | "ordered" | "delivered"; qty: number; unitPricePaise: number }[];
  services: { status: ServiceBookingStatus; quotePaise: number | null }[];
}

export interface ProjectMoney {
  budgetPaise: number;
  spentPaise: number;
  committedPaise: number;
  plannedPaise: number;
  remainingPaise: number;
  overBudget: boolean;
}

/** `qty` is a Float (a plan says "12.5 sq.ft."); money must not be. Rounded
    per line, before summing, so the total is a sum of whole-paise lines. */
function lineValue(m: { qty: number; unitPricePaise: number }): number {
  return Math.round(m.qty * m.unitPricePaise);
}

export function projectMoney(input: MoneyInput): ProjectMoney {
  const spentPaise = input.orders
    .filter((o) => moneyMoved(o.status))
    .reduce((sum, o) => sum + o.totalPaise, 0);

  const committedMaterials = input.materials
    .filter((m) => m.status !== "planned")
    .reduce((sum, m) => sum + lineValue(m), 0);
  const committedServices = input.services
    .filter((s) => bookingCommitsMoney(s.status) && s.quotePaise != null)
    .reduce((sum, s) => sum + (s.quotePaise ?? 0), 0);
  const committedPaise = committedMaterials + committedServices;

  const plannedPaise = input.materials
    .filter((m) => m.status === "planned")
    .reduce((sum, m) => sum + lineValue(m), 0);

  const remainingPaise = input.budgetPaise - spentPaise - committedPaise;

  return {
    budgetPaise: input.budgetPaise,
    spentPaise,
    committedPaise,
    plannedPaise,
    remainingPaise,
    /* Only meaningful against a budget someone set. A project with no
       budget and one order is not "over budget" — it has no budget. */
    overBudget: input.budgetPaise > 0 && spentPaise + committedPaise > input.budgetPaise,
  };
}
