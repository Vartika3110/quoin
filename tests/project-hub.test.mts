import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* Pure and client-safe — type-only Prisma import, same shim as
   projects-client.test.mts for why DATABASE_URL/AUTH_SECRET are not
   needed before importing. */
const { projectJourney } = await import("@/lib/projects/journey");

const EMPTY = {
  createdAt: "2026-01-01T00:00:00.000Z",
  materials: [] as { status: "planned" | "ordered" | "delivered" }[],
  orders: [] as {
    createdAt: string;
    status: string;
    expectedDeliveryOn: string | null;
  }[],
  services: [] as {
    createdAt: string;
    scheduledAt: string | null;
    serviceSlug: string;
    status: string;
  }[],
};

describe("projectJourney: project created", () => {
  it("is always done, dated at the project's own creation", () => {
    const steps = projectJourney(EMPTY as never);
    const created = steps.find((s) => s.key === "created")!;
    assert.equal(created.done, true);
    assert.equal(created.at, "2026-01-01T00:00:00.000Z");
  });
});

describe("projectJourney: materials selected", () => {
  it("is not done with nothing on the project", () => {
    const steps = projectJourney(EMPTY as never);
    assert.equal(steps.find((s) => s.key === "materials_selected")!.done, false);
  });

  it("is done from a hand-tracked material alone, with no date to show for it", () => {
    const steps = projectJourney({
      ...EMPTY,
      materials: [{ status: "planned" }],
    } as never);
    const step = steps.find((s) => s.key === "materials_selected")!;
    assert.equal(step.done, true);
    assert.equal(step.at, null); // a material line has no "added at" column on this view
  });

  it("is done from a linked order alone, dated at the earliest one", () => {
    const steps = projectJourney({
      ...EMPTY,
      orders: [
        { createdAt: "2026-03-01T00:00:00.000Z", status: "PENDING_PAYMENT", expectedDeliveryOn: null },
        { createdAt: "2026-02-01T00:00:00.000Z", status: "DELIVERED", expectedDeliveryOn: null },
      ],
    } as never);
    const step = steps.find((s) => s.key === "materials_selected")!;
    assert.equal(step.done, true);
    assert.equal(step.at, "2026-02-01T00:00:00.000Z");
  });
});

describe("projectJourney: order placed", () => {
  it("needs money to have actually moved, not merely a linked order", () => {
    const steps = projectJourney({
      ...EMPTY,
      orders: [{ createdAt: "2026-02-01T00:00:00.000Z", status: "PENDING_PAYMENT", expectedDeliveryOn: null }],
    } as never);
    assert.equal(steps.find((s) => s.key === "order_placed")!.done, false);
  });

  it("is done once a linked order's money has moved, dated at the earliest such order", () => {
    const steps = projectJourney({
      ...EMPTY,
      orders: [
        { createdAt: "2026-02-01T00:00:00.000Z", status: "PENDING_PAYMENT", expectedDeliveryOn: null },
        { createdAt: "2026-03-01T00:00:00.000Z", status: "CONFIRMED", expectedDeliveryOn: null },
        { createdAt: "2026-01-15T00:00:00.000Z", status: "DELIVERED", expectedDeliveryOn: null },
      ],
    } as never);
    const step = steps.find((s) => s.key === "order_placed")!;
    assert.equal(step.done, true);
    assert.equal(step.at, "2026-01-15T00:00:00.000Z");
  });
});

describe("projectJourney: service booked", () => {
  it("a cancelled booking alone does not count", () => {
    const steps = projectJourney({
      ...EMPTY,
      services: [
        {
          createdAt: "2026-01-05T00:00:00.000Z",
          scheduledAt: null,
          serviceSlug: "installation",
          status: "CANCELLED",
        },
      ],
    } as never);
    assert.equal(steps.find((s) => s.key === "service_booked")!.done, false);
  });

  it("any other status counts, dated at the earliest active booking", () => {
    const steps = projectJourney({
      ...EMPTY,
      services: [
        {
          createdAt: "2026-02-01T00:00:00.000Z",
          scheduledAt: null,
          serviceSlug: "installation",
          status: "REQUESTED",
        },
        {
          createdAt: "2026-01-10T00:00:00.000Z",
          scheduledAt: null,
          serviceSlug: "site-inspection",
          status: "CANCELLED",
        },
      ],
    } as never);
    const step = steps.find((s) => s.key === "service_booked")!;
    assert.equal(step.done, true);
    assert.equal(step.at, "2026-02-01T00:00:00.000Z");
  });
});

describe("projectJourney: materials delivered", () => {
  it("is done from a delivered material alone, with no date fabricated for it", () => {
    const steps = projectJourney({
      ...EMPTY,
      materials: [{ status: "delivered" }],
    } as never);
    const step = steps.find((s) => s.key === "materials_delivered")!;
    assert.equal(step.done, true);
    assert.equal(step.at, null);
  });

  it("is done from a DELIVERED linked order, dated at its expectedDeliveryOn when set", () => {
    const steps = projectJourney({
      ...EMPTY,
      orders: [
        { createdAt: "2026-01-01T00:00:00.000Z", status: "DELIVERED", expectedDeliveryOn: "2026-01-20" },
      ],
    } as never);
    const step = steps.find((s) => s.key === "materials_delivered")!;
    assert.equal(step.done, true);
    assert.equal(step.at, "2026-01-20");
  });

  it("is done but undated when a DELIVERED order never had a committed delivery day", () => {
    const steps = projectJourney({
      ...EMPTY,
      orders: [{ createdAt: "2026-01-01T00:00:00.000Z", status: "DELIVERED", expectedDeliveryOn: null }],
    } as never);
    const step = steps.find((s) => s.key === "materials_delivered")!;
    assert.equal(step.done, true);
    assert.equal(step.at, null);
  });

  it("an order that is merely dispatched, not delivered, does not count", () => {
    const steps = projectJourney({
      ...EMPTY,
      orders: [
        { createdAt: "2026-01-01T00:00:00.000Z", status: "DISPATCHED", expectedDeliveryOn: "2026-01-20" },
      ],
    } as never);
    assert.equal(steps.find((s) => s.key === "materials_delivered")!.done, false);
  });
});

describe("projectJourney: installation / final inspection", () => {
  it("only a COMPLETED booking on the matching service slug counts", () => {
    const steps = projectJourney({
      ...EMPTY,
      services: [
        {
          createdAt: "2026-01-01T00:00:00.000Z",
          scheduledAt: "2026-01-10T09:00:00.000Z",
          serviceSlug: "installation",
          status: "SCHEDULED", // not completed yet
        },
      ],
    } as never);
    assert.equal(steps.find((s) => s.key === "installation")!.done, false);
  });

  it("is dated at scheduledAt when set, falling back to createdAt", () => {
    const steps = projectJourney({
      ...EMPTY,
      services: [
        {
          createdAt: "2026-01-01T00:00:00.000Z",
          scheduledAt: "2026-01-10T09:00:00.000Z",
          serviceSlug: "installation",
          status: "COMPLETED",
        },
        {
          createdAt: "2026-02-01T00:00:00.000Z",
          scheduledAt: null,
          serviceSlug: "site-inspection",
          status: "COMPLETED",
        },
      ],
    } as never);
    const installation = steps.find((s) => s.key === "installation")!;
    const inspection = steps.find((s) => s.key === "final_inspection")!;
    assert.equal(installation.done, true);
    assert.equal(installation.at, "2026-01-10T09:00:00.000Z");
    assert.equal(inspection.done, true);
    assert.equal(inspection.at, "2026-02-01T00:00:00.000Z"); // no scheduledAt — falls back
  });

  it("a different service slug, even completed, does not count as installation", () => {
    const steps = projectJourney({
      ...EMPTY,
      services: [
        {
          createdAt: "2026-01-01T00:00:00.000Z",
          scheduledAt: null,
          serviceSlug: "flooring",
          status: "COMPLETED",
        },
      ],
    } as never);
    assert.equal(steps.find((s) => s.key === "installation")!.done, false);
    assert.equal(steps.find((s) => s.key === "final_inspection")!.done, false);
  });
});

describe("projectJourney: step order", () => {
  it("always returns the same seven steps, in the same order", () => {
    const steps = projectJourney(EMPTY as never);
    assert.deepEqual(
      steps.map((s) => s.key),
      [
        "created",
        "materials_selected",
        "order_placed",
        "service_booked",
        "materials_delivered",
        "installation",
        "final_inspection",
      ],
    );
  });
});
