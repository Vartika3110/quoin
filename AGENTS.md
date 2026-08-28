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
