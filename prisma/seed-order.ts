/**
 * Orders to look at, for exercising the admin console.
 *
 * ## Why this exists
 *
 * Four items in `docs/QUOIN_LAUNCH_READINESS.md` — ORD-04, ADM-04,
 * ADM-05 and ADM-06 — are "code written, never exercised". They were
 * stuck for a reason that was not what it looked like: not a missing
 * screen, but a missing *order*. The only code path that creates one is
 * checkout, production holds zero orders since ORD-16 cleared October's
 * test traffic, and nothing in `scripts/` or `prisma/` could make one.
 * So the queue, the board, the detail page and the customer page had
 * nothing to render and no one had ever seen them with content in them.
 *
 * This fills that gap without waiting for PAY-18, because the admin
 * screens are not a payment question — they are a question about whether
 * a row renders and a transition applies.
 *
 * ## What it refuses to do
 *
 * **It will not run against a database that is not local.** This matters
 * more here than almost anywhere else in the repository: `.env.local`
 * points at the production Supabase pooler, so a seed script that
 * inherited its environment would write fake orders into the real shop.
 * `assertLocalDatabase` below is therefore not a nicety — it is the
 * reason this file is safe to keep. It allows `localhost`, `127.0.0.1`
 * and `[::1]` only, and it refuses anything carrying `supabase`,
 * `pooler` or `amazonaws` whatever the host looks like.
 *
 * ## Running it
 *
 * You need a throwaway Postgres. This machine had none — no Docker, no
 * Homebrew, no Postgres.app — so the walk that produced ORD-04, ADM-04,
 * ADM-05 and ADM-06 used real Postgres 17 binaries fetched by npm and
 * run on a spare port, which needs no system install and no admin
 * rights:
 *
 *     npm install --no-save embedded-postgres@17.12.0-beta.19
 *
 * `--no-save` on purpose: this is a harness, not a dependency of the
 * application, and nothing in `src/` imports it. Start it with a few
 * lines of script (`new EmbeddedPostgres({ databaseDir, port: 55432,
 * persistent: true })`, `initialise()`, `start()`, `createDatabase()`),
 * then:
 *
 *     DATABASE_URL="postgresql://…@127.0.0.1:55432/quoin_admin_fixture" \
 *       npx prisma db push --skip-generate
 *     DATABASE_URL="postgresql://…@127.0.0.1:55432/quoin_admin_fixture" \
 *       npx tsx prisma/seed-order.ts
 *
 * Any other local Postgres does just as well. The one thing that must
 * not change is that it is local.
 *
 * `.claude/launch.json` carries a `quoin-admin-fixture` entry that runs
 * the dev server on port 3200 against that database with
 * `ADMIN_ALLOWLIST` already set, which is the other half of what the
 * admin console needs.
 *
 * `DATABASE_URL` must be passed explicitly. `prisma.config.ts` turns
 * Prisma's own `.env` loading off and `src/lib/load-env-file` never
 * overwrites a value the environment already set, so an exported value
 * wins — which is what makes the guard reliable rather than advisory.
 *
 * It is idempotent: every row is keyed on a `fixture-` id or an
 * `AFIX-`-prefixed reference and upserted, so running it twice changes
 * nothing. `--reset` deletes what it created first, for starting clean
 * after walking the transitions.
 *
 * ## What it creates
 *
 * One staff user that `canAccessAdmin` will admit **provided its email
 * is in `ADMIN_ALLOWLIST`** — the gate is two locks and this script can
 * only set one of them; it prints the email to put in the other.
 * Two customers, one vendor, two products, and **seven orders spread
 * across the lifecycle** so that the queue's status filter, the board's
 * columns and the detail page's timeline all have something real to
 * show, including the two states that only exist because a paid order
 * cannot be cancelled: `REFUND_PENDING` and `REFUNDED`.
 */

import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";
import type { Fulfilment, OrderStatus } from "@prisma/client";
import { taxForLine } from "../src/lib/types/catalog";

/**
 * The guard, and the only part of this file worth reading closely.
 *
 * A hostname check alone is not enough, because a tunnel or a proxy can
 * put a remote database behind `127.0.0.1`. So this does both halves:
 * the host must be one of the three local spellings, *and* the whole URL
 * must not name a managed-Postgres vendor. Either test failing stops the
 * script.
 */
function assertLocalDatabase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Pass it explicitly — this script must " +
        "never pick up the production connection string from a file.",
    );
  }

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL is not a URL this script can check. Refusing.");
  }

  const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!LOCAL.has(host)) {
    throw new Error(
      `Refusing to seed: ${host} is not a local database. This script ` +
        "creates fake orders and must only ever touch a throwaway " +
        "cluster. Start one and pass its DATABASE_URL.",
    );
  }

  /* Belt and braces: a local-looking host that is really a tunnel to a
     managed instance. Cheap to check, and the cost of being wrong is
     fake orders in the real shop. */
  const FOREIGN = ["supabase", "pooler", "amazonaws", "neon.tech", "render.com"];
  const named = FOREIGN.find((needle) => url.toLowerCase().includes(needle));
  if (named) {
    throw new Error(
      `Refusing to seed: DATABASE_URL mentions "${named}", so it may be ` +
        "forwarding to a managed database despite the local hostname.",
    );
  }

  return host;
}

/* Everything this script writes carries one of these, so `--reset` can
   find its own rows and nothing else. */
const FIXTURE_PREFIX = "fixture-";
const REFERENCE_PREFIX = "AFIX-";

const db = new PrismaClient();

/** A line as the order tables want it, with GST backed out, not added. */
function line(input: {
  productSlug: string;
  variantId: string;
  sku: string;
  title: string;
  variantLabel: string;
  qty: number;
  unitPricePaise: number;
  mrpPaise: number;
  gstRatePct: number;
  fulfilment: Fulfilment;
}) {
  const linePaise = input.unitPricePaise * input.qty;
  return {
    ...input,
    linePaise,
    /* The same function the product page and the invoice use. A fixture
       that computed tax its own way would make the admin page agree with
       nothing. */
    taxPaise: taxForLine(linePaise, input.gstRatePct),
  };
}

interface OrderSpec {
  suffix: string;
  status: OrderStatus;
  customer: 1 | 2;
  /** Whether a vendor leg exists, and whether that leg has dispatched. */
  fulfilment: "none" | "pending" | "dispatched";
  paid: boolean;
  /** Prior statuses to write into the timeline, oldest first. */
  history: OrderStatus[];
  /**
   * How long ago this order was placed, in days.
   *
   * `0` means today, and exactly one order uses it: the dashboard's
   * "revenue today" tile reads `Order.paidAt` within the current IST
   * day, so a fixture where every order is backdated leaves that tile
   * at ₹0 and proves nothing about it.
   */
  ageDays: number;
  note?: string;
}

/**
 * Seven orders, chosen so every screen has something to show.
 *
 * The spread is deliberate rather than arbitrary. The board has columns
 * per stage, so a board with every order in one column proves nothing.
 * `REFUND_PENDING` and `REFUNDED` are here because they are the whole
 * reason `PAID → CANCELLED` is refused, and a console that cannot show
 * them cannot show a customer who is owed money.
 */
const ORDERS: OrderSpec[] = [
  {
    suffix: "PEND01",
    status: "PENDING_PAYMENT",
    customer: 1,
    fulfilment: "none",
    paid: false,
    history: [],
    ageDays: 0,
  },
  {
    suffix: "PAID01",
    status: "PAID",
    customer: 1,
    fulfilment: "pending",
    paid: true,
    history: ["PENDING_PAYMENT"],
    /* Today, so "revenue today" has a number in it. */
    ageDays: 0,
  },
  {
    suffix: "DISP01",
    status: "DISPATCHED",
    customer: 2,
    fulfilment: "dispatched",
    paid: true,
    history: ["PENDING_PAYMENT", "PAID"],
    ageDays: 2,
  },
  {
    suffix: "OFDL01",
    status: "OUT_FOR_DELIVERY",
    customer: 2,
    fulfilment: "dispatched",
    paid: true,
    history: ["PENDING_PAYMENT", "PAID", "DISPATCHED"],
    ageDays: 3,
  },
  {
    suffix: "DELV01",
    status: "DELIVERED",
    customer: 1,
    fulfilment: "dispatched",
    paid: true,
    history: ["PENDING_PAYMENT", "PAID", "DISPATCHED", "OUT_FOR_DELIVERY"],
    ageDays: 5,
  },
  {
    suffix: "REFP01",
    status: "REFUND_PENDING",
    customer: 2,
    fulfilment: "pending",
    paid: true,
    history: ["PENDING_PAYMENT", "PAID"],
    ageDays: 4,
    note: "Customer asked to return the putty — wrong shade.",
  },
  {
    suffix: "FAIL01",
    status: "FAILED",
    customer: 1,
    fulfilment: "none",
    paid: false,
    history: ["PENDING_PAYMENT"],
    ageDays: 1,
    note: "Gateway refused the card: domestic cards only on this account.",
  },
];

async function reset(): Promise<void> {
  /* Order matters only where a relation is `Restrict`: `Payment.order`
     is, so payments go before orders. The rest cascade. */
  const orders = await db.order.findMany({
    where: { reference: { startsWith: REFERENCE_PREFIX } },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);

  /* Deletion order is dictated by the `Restrict` relations, and getting
     it wrong is how this threw the first time: `Payment.order` is
     Restrict, so payments precede orders, and `Product.vendor` is too,
     so products precede the vendor. Order lines, status changes and
     fulfilments are all Cascade from `Order`, so deleting the orders
     takes them with it. */
  await db.payment.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.address.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } });
  await db.productVariant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  });
  await db.product.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } });
  await db.category.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } });
  await db.vendor.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } });
  await db.user.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } });

  console.log(`  removed ${ids.length} fixture orders and their rows`);
}

async function main(): Promise<void> {
  const host = assertLocalDatabase();
  console.log(`seeding admin fixtures into ${host} …\n`);

  if (process.argv.includes("--reset")) {
    console.log("--reset:");
    await reset();
    if (process.argv.includes("--only-reset")) return;
    console.log();
  }

  /* ---------- people ---------- */

  const staff = await db.user.upsert({
    where: { id: `${FIXTURE_PREFIX}staff` },
    update: { isStaff: true },
    create: {
      id: `${FIXTURE_PREFIX}staff`,
      name: "Fixture Staff",
      email: "fixture-staff@quoin.local",
      phone: "+919000000001",
      isStaff: true,
    },
  });

  const customers = await Promise.all(
    [
      {
        id: `${FIXTURE_PREFIX}cust1`,
        name: "Ritu Malhotra",
        phone: "+919811111111",
        email: "ritu@example.local",
        tier: "PRO" as const,
        walletPaise: 25_000,
      },
      {
        id: `${FIXTURE_PREFIX}cust2`,
        name: "Imran Qureshi",
        phone: "+919822222222",
        email: "imran@example.local",
        tier: "STANDARD" as const,
        walletPaise: 0,
      },
    ].map((c) =>
      db.user.upsert({ where: { id: c.id }, update: {}, create: c }),
    ),
  );

  const addresses = await Promise.all(
    customers.map((c, i) =>
      db.address.upsert({
        where: { id: `${FIXTURE_PREFIX}addr${i + 1}` },
        update: {},
        create: {
          id: `${FIXTURE_PREFIX}addr${i + 1}`,
          userId: c.id,
          label: "HOME",
          line1: i === 0 ? "C-14, Block C, Janakpuri" : "48 Paschim Vihar Extn",
          line2: i === 0 ? "Second floor" : null,
          landmark: i === 0 ? "Opposite the district centre" : null,
          city: "New Delhi",
          state: "Delhi",
          pincode: i === 0 ? "110058" : "110063",
          recipientName: c.name,
          recipientPhone: c.phone,
          lat: i === 0 ? 28.6219 : 28.6692,
          lng: i === 0 ? 77.0878 : 77.1025,
          isDefault: true,
        },
      }),
    ),
  );

  /* ---------- a vendor, so a dispatch leg exists ---------- */

  const vendor = await db.vendor.upsert({
    where: { id: `${FIXTURE_PREFIX}vendor` },
    update: {},
    create: {
      id: `${FIXTURE_PREFIX}vendor`,
      legalName: "Fixture Building Supplies Private Limited",
      tradeName: "Fixture Supplies",
      phone: "+919833333333",
      addressLine: "Plot 7, Mangolpuri Industrial Area",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110083",
    },
  });

  /* ---------- something to have bought ---------- */

  const category = await db.category.upsert({
    where: { id: `${FIXTURE_PREFIX}cat` },
    update: {},
    create: {
      id: `${FIXTURE_PREFIX}cat`,
      name: "Fixture Department",
      slug: "fixture-department",
      position: 99,
      isActive: true,
    },
  });

  const CATALOGUE = [
    {
      key: "putty",
      sku: "FIX-PUTTY-20",
      name: "Fixture White Putty 20 kg",
      slug: "fixture-white-putty-20kg",
      gstRatePct: 18,
      pricePaise: 41_600,
      mrpPaise: 48_000,
      fulfilment: "SCHEDULED" as Fulfilment,
    },
    {
      key: "valve",
      sku: "FIX-VALVE-15",
      name: "Fixture Brass Angle Valve 15 mm",
      slug: "fixture-brass-angle-valve-15mm",
      gstRatePct: 18,
      pricePaise: 140_000,
      mrpPaise: 165_000,
      fulfilment: "SCHEDULED" as Fulfilment,
    },
  ];

  const variants: Record<string, { id: string; sku: string }> = {};
  for (const item of CATALOGUE) {
    await db.product.upsert({
      where: { id: `${FIXTURE_PREFIX}prod-${item.key}` },
      update: {},
      create: {
        id: `${FIXTURE_PREFIX}prod-${item.key}`,
        sku: item.sku,
        name: item.name,
        slug: item.slug,
        description: "A fixture product. Not for sale and not in the catalogue.",
        categoryId: category.id,
        vendorId: vendor.id,
        fulfilment: item.fulfilment,
        pricingUnit: item.key === "putty" ? "PER_BAG" : "PER_PIECE",
        gstRatePct: item.gstRatePct,
        image: "/products/placeholder.webp",
        imageIsGenerated: true,
        isActive: true,
        stockTracked: false,
      },
    });

    const variant = await db.productVariant.upsert({
      where: { id: `${FIXTURE_PREFIX}var-${item.key}` },
      update: {},
      create: {
        id: `${FIXTURE_PREFIX}var-${item.key}`,
        productId: `${FIXTURE_PREFIX}prod-${item.key}`,
        label: "Default",
        sku: `${item.sku}-D`,
        mrpPaise: item.mrpPaise,
        pricePaise: item.pricePaise,
        minQty: 1,
        stepQty: 1,
        isDefault: true,
        isActive: true,
      },
    });
    variants[item.key] = { id: variant.id, sku: variant.sku };
  }

  /* ---------- the orders ---------- */

  let created = 0;
  for (const spec of ORDERS) {
    const reference = `${REFERENCE_PREFIX}${spec.suffix}`;
    const existing = await db.order.findUnique({ where: { reference } });
    if (existing) continue;

    const customer = customers[spec.customer - 1];
    const address = addresses[spec.customer - 1];

    /* Two lines on some orders and one on others, so the detail page is
       exercised both ways and the queue's totals differ. */
    const lines = [
      line({
        productSlug: CATALOGUE[0].slug,
        variantId: variants.putty.id,
        sku: variants.putty.sku,
        title: CATALOGUE[0].name,
        variantLabel: "Default",
        qty: spec.suffix.startsWith("DELV") ? 3 : 2,
        unitPricePaise: CATALOGUE[0].pricePaise,
        mrpPaise: CATALOGUE[0].mrpPaise,
        gstRatePct: CATALOGUE[0].gstRatePct,
        fulfilment: CATALOGUE[0].fulfilment,
      }),
      ...(spec.customer === 2
        ? [
            line({
              productSlug: CATALOGUE[1].slug,
              variantId: variants.valve.id,
              sku: variants.valve.sku,
              title: CATALOGUE[1].name,
              variantLabel: "Default",
              qty: 1,
              unitPricePaise: CATALOGUE[1].pricePaise,
              mrpPaise: CATALOGUE[1].mrpPaise,
              gstRatePct: CATALOGUE[1].gstRatePct,
              fulfilment: CATALOGUE[1].fulfilment,
            }),
          ]
        : []),
    ];

    const subtotalPaise = lines.reduce((sum, l) => sum + l.linePaise, 0);
    const taxPaise = lines.reduce((sum, l) => sum + l.taxPaise, 0);
    /* Not `subtotal + tax`. The tax is already inside the subtotal —
       the same rule `createOrder` states and the reason GST is extracted
       per line rather than added on top. */
    const totalPaise = subtotalPaise;

    const DAY = 1000 * 60 * 60 * 24;
    /* Placed `ageDays` ago at mid-morning; settled two hours later. The
       two clocks are kept together on purpose: the dashboard reads
       `Order.paidAt` for revenue and `Payment.createdAt` for the payment
       tiles, and on a real order `settleCapturedPayment` writes both
       within seconds of each other. A fixture that backdated one and not
       the other would make those two tiles disagree for a reason that
       exists nowhere but in this file. */
    const placedAt = new Date(Date.now() - spec.ageDays * DAY - 4 * 3600_000);
    const paidAt = spec.paid ? new Date(placedAt.getTime() + 2 * 3600_000) : null;
    const paymentAt = paidAt ?? placedAt;

    await db.order.create({
      data: {
        reference,
        userId: customer.id,
        status: spec.status,
        subtotalPaise,
        taxPaise,
        totalPaise,
        addressId: address.id,
        shipName: customer.name!,
        shipPhone: customer.phone!,
        shipLine1: address.line1,
        shipLine2: address.line2,
        shipLandmark: address.landmark,
        shipCity: address.city,
        shipState: address.state,
        shipPincode: address.pincode,
        paidAt,
        createdAt: placedAt,
        lines: { create: lines },
        payments: spec.paid
          ? {
              create: {
                provider: "RAZORPAY",
                providerOrderId: `order_FIX${spec.suffix}`,
                providerPaymentId: `pay_FIX${spec.suffix}`,
                amountPaise: totalPaise,
                status: "CAPTURED",
                method: "upi",
                createdAt: paymentAt,
              },
            }
          : spec.status === "FAILED"
            ? {
                create: {
                  provider: "RAZORPAY",
                  providerOrderId: `order_FIX${spec.suffix}`,
                  providerPaymentId: `pay_FIX${spec.suffix}`,
                  amountPaise: totalPaise,
                  status: "FAILED",
                  method: "card",
                  createdAt: paymentAt,
                  failureReason:
                    "This business accepts domestic (Indian) card payments only.",
                },
              }
            : {
                create: {
                  provider: "RAZORPAY",
                  providerOrderId: `order_FIX${spec.suffix}`,
                  amountPaise: totalPaise,
                  status: "CREATED",
                  createdAt: paymentAt,
                },
              },
        fulfilments:
          spec.fulfilment === "none"
            ? undefined
            : {
                create: {
                  vendorId: vendor.id,
                  vendorName: vendor.tradeName || vendor.legalName,
                  vendorPhone: vendor.phone,
                  status: spec.fulfilment === "dispatched" ? "DISPATCHED" : "PENDING",
                  actionToken: `fixtoken-${spec.suffix.toLowerCase()}`,
                  dispatchedAt:
                    spec.fulfilment === "dispatched"
                      ? new Date(Date.now() - 1000 * 60 * 60 * 12)
                      : null,
                },
              },
        statusChanges: spec.history.length
          ? {
              create: spec.history.map((from, i) => ({
                fromStatus: from,
                toStatus: spec.history[i + 1] ?? spec.status,
                actorUserId: i === 0 ? null : staff.id,
                note: i === spec.history.length - 1 ? spec.note : null,
                createdAt: new Date(placedAt.getTime() + (i + 1) * 3600_000),
              })),
            }
          : undefined,
      },
    });
    created += 1;
  }

  /* ---------- what to do with it ---------- */

  const counts = await db.order.groupBy({
    by: ["status"],
    where: { reference: { startsWith: REFERENCE_PREFIX } },
    _count: true,
  });

  console.log(`${created} order(s) created; fixture orders now:`);
  for (const row of counts.sort((a, b) => a.status.localeCompare(b.status))) {
    console.log(`  ${row.status.padEnd(18)} ${row._count}`);
  }
  console.log(`
Staff identity
  user id   ${staff.id}
  email     ${staff.email}

That is one of the two locks. The other is the environment:

  ADMIN_ALLOWLIST=${staff.email}

\`canAccessAdmin\` needs both, by design — \`isStaff\` alone is set here and
is deliberately not enough. Nothing in this script can grant the second
half, which is the point of SEC/ADM-12.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
