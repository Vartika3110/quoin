import type { OrderStatus, ProjectTaskStatus, ServiceBookingStatus, UserTier } from "@prisma/client";
import { db } from "@/lib/db";
import { projectMoney, type ProjectMoney } from "@/lib/projects/money";
import { IN_FLIGHT_STATUSES, MONEY_MOVED_STATUSES } from "@/lib/orders/status-groups";
import { bookingGroup } from "@/lib/services/booking-status";
import { listBookingsForUser, type ServiceBookingListItem } from "@/lib/data/service-bookings";
import { listOrdersForUser } from "@/lib/data/order-history";
import { countDocumentsForUser } from "@/lib/data/documents";
import { MATERIAL_STATUS_FROM_DB, toCalendarDate } from "@/lib/data/projects";
import { startOfMonthIST, todayIST } from "@/lib/account/greeting";
import type { ConsultSlot } from "@/lib/types/consult";
import type { Paise } from "@/lib/types/catalog";

/**
 * The account overview — one read that answers "what does this account
 * need to see right now", for the dashboard at `/account`.
 *
 * Every query below is scoped to `userId` in its own `where` clause, the
 * same discipline `order-history.ts` documents at its own top: there is no
 * later step that narrows a wider read, because a wider read is never
 * made. Independent reads run inside `Promise.all` batches; `pro` is the
 * one exception, gated behind `user.tier`, which is only known once the
 * user row itself has come back.
 */

/** ---- Pure helpers ---------------------------------------------------------
 * Exported so `tests/account-overview.test.mts` can exercise the branching
 * in each without a database — see the reasoning on `orderTimeline`
 * (`src/lib/orders/timeline.ts`) for why logic like this is kept separable
 * from the query that feeds it.
 */

/** A project's progress, from its own tasks — `null` when there are none
    to be done, which is a project not yet broken into tasks, not 0%. */
export function projectProgressPct(tasks: { status: ProjectTaskStatus }[]): number | null {
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.status === "DONE").length;
  return Math.round((done / tasks.length) * 100);
}

/**
 * The soonest of a set of upcoming bookings — by `scheduledAt` where a
 * person has agreed one, else by `preferredDate`, with a booking that has
 * stated neither sorted last rather than first (`null` is "unknown", not
 * "now").
 *
 * Parses each effective value to an instant rather than comparing the wire
 * strings directly: `scheduledAt` is a full ISO timestamp and
 * `preferredDate` is a bare `YYYY-MM-DD`, and the two are different
 * lengths, so the lexical-string shortcut `earliestAt`
 * (`src/lib/orders/timeline.ts`) uses for same-shaped values does not hold
 * once a row of either kind can end up next to the other.
 */
export function pickNextService<
  T extends { scheduledAt: string | null; preferredDate: string | null },
>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;

  function effectiveAt(row: T): number | null {
    const value = row.scheduledAt ?? row.preferredDate;
    return value ? new Date(value).getTime() : null;
  }

  return rows.reduce((best, row) => {
    const bestAt = effectiveAt(best);
    const rowAt = effectiveAt(row);
    if (bestAt === null) return rowAt === null ? best : row;
    if (rowAt === null) return best;
    return rowAt < bestAt ? row : best;
  });
}

/** Every status `bookingGroup` (`src/lib/services/booking-status.ts`)
    reads as "upcoming" — derived from that function rather than written
    out a second time, so a status added to the enum without being taught
    to `bookingGroup` cannot silently fall out of this count too. */
const ALL_BOOKING_STATUSES: ServiceBookingStatus[] = [
  "REQUESTED",
  "QUOTE_PENDING",
  "QUOTE_RECEIVED",
  "CONFIRMED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];
const UPCOMING_BOOKING_STATUSES = new Set(
  ALL_BOOKING_STATUSES.filter((status) => bookingGroup(status) === "upcoming"),
);

/** ---- Wire shapes ----------------------------------------------------------- */

export interface AccountOverviewUser {
  name: string | null;
  email: string | null;
  phone: string | null;
  deliveryPhone: string | null;
  tier: UserTier;
  walletPaise: Paise;
  isStaff: boolean;
}

export interface AccountOverviewProject {
  id: string;
  name: string;
  progressPct: number | null;
  money: ProjectMoney;
  nextMilestone: { title: string; date: Date } | null;
}

export interface AccountOverviewOrder {
  reference: string;
  status: OrderStatus;
  totalPaise: Paise;
  /** `YYYY-MM-DD`, or null — see the model comment on
      `Order.expectedDeliveryOn`. Never computed from a lead time. */
  expectedDeliveryOn: string | null;
  itemCount: number;
  createdAt: Date;
}

export interface AccountOverviewService {
  serviceName: string;
  reference: string;
  /** ISO timestamp, or null until a person has agreed an exact time. */
  scheduledAt: string | null;
  /** `YYYY-MM-DD`, or null. */
  preferredDate: string | null;
  preferredSlot: ConsultSlot | null;
  status: ServiceBookingStatus;
}

export interface AccountOverviewPro {
  monthlySpendPaise: Paise;
  pendingQuotationCount: number;
  upcomingDeliveryCount: number;
  activeProjectCount: number;
}

export interface AccountOverview {
  user: AccountOverviewUser;
  projects: { activeProjectCount: number; top: AccountOverviewProject[] };
  orders: { activeOrderCount: number; latestOrder: AccountOverviewOrder | null };
  services: { upcomingServiceCount: number; nextService: AccountOverviewService | null };
  documents: { count: number };
  /** Only present for a Pro account — see the spec on the overview page:
      a Standard account is shown what Pro would add, never a zeroed-out
      version of figures it does not have. */
  pro: AccountOverviewPro | null;
}

/** Cards on the dashboard; the projects list page shows the rest. */
const TOP_PROJECT_COUNT = 2;

async function loadTopProjects(userId: string, today: Date): Promise<AccountOverviewProject[]> {
  const rows = await db.project.findMany({
    where: { userId, archivedAt: null, isSample: false },
    orderBy: { updatedAt: "desc" },
    take: TOP_PROJECT_COUNT,
    select: {
      id: true,
      name: true,
      budgetPaise: true,
      tasks: { select: { status: true } },
      materials: { select: { status: true, qty: true, unitPricePaise: true } },
      serviceBookings: { select: { status: true, quotePaise: true } },
      orders: { select: { order: { select: { status: true, totalPaise: true } } } },
      /* The earliest milestone still ahead — done ones and ones already
         missed say nothing about what is next. */
      milestones: {
        where: { done: false, date: { gte: today } },
        orderBy: { date: "asc" },
        take: 1,
        select: { title: true, date: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    progressPct: projectProgressPct(row.tasks),
    money: projectMoney({
      budgetPaise: row.budgetPaise,
      orders: row.orders.map((po) => po.order),
      materials: row.materials.map((m) => ({
        status: MATERIAL_STATUS_FROM_DB[m.status],
        qty: m.qty,
        unitPricePaise: m.unitPricePaise,
      })),
      services: row.serviceBookings,
    }),
    nextMilestone: row.milestones[0]
      ? { title: row.milestones[0].title, date: row.milestones[0].date }
      : null,
  }));
}

function serviceOverviewOf(row: ServiceBookingListItem): AccountOverviewService {
  return {
    serviceName: row.serviceName,
    reference: row.reference,
    scheduledAt: row.scheduledAt,
    preferredDate: row.preferredDate,
    preferredSlot: row.preferredSlot,
    status: row.status,
  };
}

export async function getAccountOverview(userId: string): Promise<AccountOverview> {
  const now = new Date();
  const today = toCalendarDate(todayIST(now));

  const [user, activeProjectCount, topProjects, activeOrderCount, latestOrderPage, bookings, documentCount] =
    await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          phone: true,
          deliveryPhone: true,
          tier: true,
          walletPaise: true,
          isStaff: true,
        },
      }),
      db.project.count({ where: { userId, archivedAt: null, isSample: false } }),
      loadTopProjects(userId, today),
      /* `IN_FLIGHT_STATUSES` deliberately excludes `PENDING_PAYMENT` — an
         abandoned online checkout should not read as an active order —
         but a callback order (`PENDING_PAYMENT`, no gateway `Payment` row
         at all) is real, unfinished work and is added back in explicitly.
         See the note on `OrderStatus.PENDING_PAYMENT` in the schema. */
      db.order.count({
        where: {
          userId,
          OR: [
            { status: { in: [...IN_FLIGHT_STATUSES] } },
            { status: "PENDING_PAYMENT", payments: { none: {} } },
          ],
        },
      }),
      listOrdersForUser(userId, 1, 1, "all"),
      listBookingsForUser(userId),
      countDocumentsForUser(userId),
    ]);

  const upcomingBookings = bookings.filter((b) => UPCOMING_BOOKING_STATUSES.has(b.status));
  const nextServiceRow = pickNextService(upcomingBookings);

  const latestOrderSummary = latestOrderPage.items[0] ?? null;

  const pro: AccountOverviewPro | null =
    user.tier === "PRO"
      ? await (async () => {
          const [monthlySpend, pendingQuotationCount, upcomingDeliveryCount] = await Promise.all([
            db.order.aggregate({
              where: {
                userId,
                status: { in: [...MONEY_MOVED_STATUSES] },
                paidAt: { gte: startOfMonthIST(now) },
              },
              _sum: { totalPaise: true },
            }),
            db.serviceBooking.count({ where: { userId, status: "QUOTE_RECEIVED" } }),
            db.order.count({
              where: {
                userId,
                status: { in: [...IN_FLIGHT_STATUSES] },
                expectedDeliveryOn: { gte: today },
              },
            }),
          ]);
          return {
            monthlySpendPaise: monthlySpend._sum?.totalPaise ?? 0,
            pendingQuotationCount,
            upcomingDeliveryCount,
            activeProjectCount,
          };
        })()
      : null;

  return {
    user,
    projects: { activeProjectCount, top: topProjects },
    orders: {
      activeOrderCount,
      latestOrder: latestOrderSummary
        ? {
            reference: latestOrderSummary.reference,
            status: latestOrderSummary.status,
            totalPaise: latestOrderSummary.totalPaise,
            expectedDeliveryOn: latestOrderSummary.expectedDeliveryOn,
            itemCount: latestOrderSummary.itemCount,
            createdAt: latestOrderSummary.createdAt,
          }
        : null,
    },
    services: {
      upcomingServiceCount: upcomingBookings.length,
      nextService: nextServiceRow ? serviceOverviewOf(nextServiceRow) : null,
    },
    documents: { count: documentCount },
    pro,
  };
}
