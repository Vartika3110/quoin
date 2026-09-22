import type { OrderStatus, ServiceBookingStatus } from "@prisma/client";
import { moneyMoved } from "@/lib/orders/status-groups";

/**
 * The project hub's timeline card — a build's own evidence, read off the
 * same rows `projectMoney` and `deriveStage` already read, rolled into a
 * fixed seven-step ladder.
 *
 * Every step but the first is derived from something that actually
 * happened (a material added, an order that moved money, a booking that
 * is not cancelled), never from a date this app invented. `at` is `null`
 * whenever no row on hand carries a real timestamp for that step — a
 * material line has no "marked delivered at" column, so "Materials
 * delivered" from material evidence alone shows no date rather than a
 * fabricated one. Pure and client-safe (type-only Prisma import), so the
 * dashboard and its tests read the same table.
 */

export interface JourneyStep {
  key:
    | "created"
    | "materials_selected"
    | "order_placed"
    | "service_booked"
    | "materials_delivered"
    | "installation"
    | "final_inspection";
  label: string;
  done: boolean;
  /** ISO instant, or a calendar day — whatever the underlying row stores.
      `null` when nothing on hand names a date for this step. */
  at: string | null;
}

export interface JourneyInput {
  /** ISO instant. */
  createdAt: string;
  materials: { status: "planned" | "ordered" | "delivered" }[];
  orders: { createdAt: string; status: OrderStatus; expectedDeliveryOn: string | null }[];
  services: {
    createdAt: string;
    scheduledAt: string | null;
    serviceSlug: string;
    status: ServiceBookingStatus;
  }[];
}

/** The earliest of whatever dates are actually present, or `null` when
    none are — never a fabricated fallback. */
function earliest(dates: (string | null | undefined)[]): string | null {
  const real = dates.filter((d): d is string => Boolean(d)).sort();
  return real[0] ?? null;
}

export function projectJourney(project: JourneyInput): JourneyStep[] {
  const moneyMovedOrders = project.orders.filter((o) => moneyMoved(o.status));
  const deliveredOrders = project.orders.filter((o) => o.status === "DELIVERED");
  const deliveredMaterials = project.materials.filter((m) => m.status === "delivered");
  /* A quote merely requested and then cancelled never happened, as far as
     the customer's own record of the build is concerned — the same "not
     yet a commitment" reasoning `bookingCommitsMoney` applies to money,
     applied here to a step on the timeline. */
  const activeServices = project.services.filter((s) => s.status !== "CANCELLED");
  const installation = project.services.find(
    (s) => s.serviceSlug === "installation" && s.status === "COMPLETED",
  );
  const inspection = project.services.find(
    (s) => s.serviceSlug === "site-inspection" && s.status === "COMPLETED",
  );

  return [
    { key: "created", label: "Project created", done: true, at: project.createdAt },
    {
      key: "materials_selected",
      label: "Materials selected",
      done: project.materials.length > 0 || project.orders.length > 0,
      /* Only a linked order carries a timestamp here — a hand-typed
         material line has no "added at" column on this view. */
      at: earliest(project.orders.map((o) => o.createdAt)),
    },
    {
      key: "order_placed",
      label: "Order placed",
      done: moneyMovedOrders.length > 0,
      at: earliest(moneyMovedOrders.map((o) => o.createdAt)),
    },
    {
      key: "service_booked",
      label: "Service booked",
      done: activeServices.length > 0,
      at: earliest(activeServices.map((s) => s.createdAt)),
    },
    {
      key: "materials_delivered",
      label: "Materials delivered",
      done: deliveredOrders.length > 0 || deliveredMaterials.length > 0,
      /* `expectedDeliveryOn` is the one delivery date anyone at Quoin has
         actually committed to (see the model comment on
         `Order.expectedDeliveryOn`) — the closest thing to a real
         "delivered at" this app has, and still only shown when a
         delivered order actually has one set. */
      at: earliest(deliveredOrders.map((o) => o.expectedDeliveryOn)),
    },
    {
      key: "installation",
      label: "Installation",
      done: Boolean(installation),
      at: installation ? (installation.scheduledAt ?? installation.createdAt) : null,
    },
    {
      key: "final_inspection",
      label: "Final inspection",
      done: Boolean(inspection),
      at: inspection ? (inspection.scheduledAt ?? inspection.createdAt) : null,
    },
  ];
}
