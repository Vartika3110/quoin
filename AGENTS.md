<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# One backend: Next.js + Prisma

There is no Django service. A `backend/` directory holding a Django + DRF
catalogue app existed briefly and was **deleted** — its models, importer and
query semantics were folded into Prisma. Do not recreate it, and do not add a
second runtime for catalogue work.

- Schema: `prisma/schema.prisma` (identity + catalogue in one datasource)
- Importer: `npm run db:import` (`prisma/import-catalogue.ts`)
- Storefront reads: `src/lib/data/catalog.ts`

Read `docs/django-to-prisma.md` before touching the catalogue. It records the
invariants the port preserved — integer paise, quarantined `source*`
provenance fields, and why nothing is imported as `INSTANT`.

# Orders: one lifecycle, four stages

The customer-facing order lifecycle is **placed → dispatched → out for
delivery → delivered**, plus **cancelled**. There is no accepted,
preparing or ready step, and `CONFIRMED`, `PROCESSING` and `PACKED` are
**retired** — still in the `OrderStatus` enum so history survives, refused
as destinations by `isAdminTransitionAllowed`, and mapped to `placed`
wherever a status is shown.

- Stage vocabulary: `src/lib/orders/lifecycle.ts` (one file, read by the
  stepper, the admin timeline, the order board and the notifier)
- The machine: `ORDER_TRANSITIONS` in `src/lib/data/orders.ts`
- One status-writing path: `transitionOrderStatus`
  (`src/lib/data/admin-orders.ts`). Vendor dispatch and the order board
  both go through it rather than writing `Order.status` themselves.
- WhatsApp: `src/lib/whatsapp/` (provider) and
  `src/lib/data/order-whatsapp.ts` (what is said, and when)

Read `docs/whatsapp-orders.md` before touching any of it. It records why
the enum was not rewritten, why a store is this app's only idea of a
vendor, how a split order avoids telling a customer the whole thing has
been dispatched when half of it has, and why a WhatsApp failure can never
roll back an order.
