<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

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
delivery → delivered**. There is no accepted, preparing or ready step,
and `CONFIRMED`, `PROCESSING` and `PACKED` are **retired** — still in the
`OrderStatus` enum so history survives, refused as destinations by
`isAdminTransitionAllowed`, and mapped to `placed` wherever a status is
shown.

**Cancellation is not part of it.** A paid order leaves by
`REFUND_PENDING → REFUNDED`, which leaves a `Refund` row saying the
customer is owed money; `CANCELLED` is reachable only from
`PENDING_PAYMENT` and `FAILED`. `tests/refunds.test.mts` asserts that and
names the order it was learned from. Do not add those edges back.

- Stage vocabulary: `src/lib/orders/lifecycle.ts` (one file, read by the
  stepper, the admin timeline, the order board and the notifiers)
- The machine: `ORDER_TRANSITIONS` in `src/lib/data/orders.ts`
- One status-writing path: `transitionOrderStatus`
  (`src/lib/data/admin-orders.ts`). Vendor dispatch and the order board
  both go through it rather than writing `Order.status` themselves.
- WhatsApp order messages: `src/lib/whatsapp/` and
  `src/lib/data/order-whatsapp.ts`. Separate from
  `src/lib/auth/whatsapp.ts`, which carries sign-in codes — same
  credentials, different templates, different failure contract.
- A vendor is a `Vendor` row reached through `Product.vendorId`. An order
  spanning vendors gets one `OrderFulfilment` each, and only reaches
  `DISPATCHED` when every one of them has.

Read `docs/whatsapp-orders.md` before touching any of it.
