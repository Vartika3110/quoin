# Backups and the restore drill

Covers `ORD-10` (backups and PITR) and `ORD-12` (restore drill) from
`QUOIN_LAUNCH_READINESS.md`, both of which block public launch.

**The state this was written in:** the Supabase project carries no
automatic backups on its current plan, and no restore has ever been
rehearsed. The database is 21 MB. There is no excuse for the first fact
and the second is a morning's work.

---

## The three layers, and why more than one

| | What it protects against | Cost | Status |
| --- | --- | --- | --- |
| Supabase daily backups (Pro) | A bad migration, a dropped table, a mistaken `UPDATE` | $25/mo — the same upgrade that clears the egress cap | **Not enabled** |
| `pg_dump`, off-platform | Anything that takes the Supabase project itself: a billing lapse, an account mistake, a region incident | Free; needs `brew install libpq` | **Not set up** |
| `scripts/export-database.ts` | The same, with nothing to install | Free | **Working** |

A Supabase backup lives inside Supabase. If the thing that goes wrong is
the account rather than the data, it goes with it — which is why a copy
somewhere else is not paranoia, and why the free exporter is worth
running even after Pro is on.

---

## The exporter

```bash
npx tsx scripts/export-database.ts                      # write one
npx tsx scripts/export-database.ts --verify backups/…   # check one
```

Every table to gzipped NDJSON, one directory per run, with a manifest
holding the row counts, a SHA-256 per table, and the migration the rows
belong to. The current database comes to **6,551 rows across 48 tables,
0.4 MB gzipped, in about fourteen seconds**.

**It is the data, not the database.** No schema, no sequences, no
indexes, no grants, and nothing from Supabase's own `auth` schema —
Prisma can only see the tables it models. The schema half lives in
`prisma/migrations`, which is in git. Together they are a rebuild; alone,
neither is.

**The output holds personal data** — customer names, phone numbers,
delivery addresses, order history. The script adds `/backups` to
`.gitignore` itself rather than trusting anyone to remember. Keep the
directories off shared drives and out of anything that syncs by default.

### What `--verify` proves

It re-reads every line, re-parses it, and recomputes the hash, so a
truncated write or a corrupted disk is found now rather than on the
morning somebody needs it. It deliberately does **not** compare against
the live database: an export is a photograph of a moment, and every
order taken since would read as a failure.

---

## The restore drill — ORD-12

A dump nobody has restored is a file, not a backup. The drill needs
somewhere to restore *to*; the cheapest honest one is a second free
Supabase project.

1. Create a second Supabase project. Nothing else goes in it.
2. Point a checkout at it: `DIRECT_DATABASE_URL` and `DATABASE_URL` to
   the new project, then `npx prisma migrate deploy`. This is the schema
   half, from git, and it either applies cleanly or you have learned
   something important.
3. Load the data. With `pg_dump`/`pg_restore` this is one command; from
   an export directory it is a loader over the NDJSON in foreign-key
   order (`Brand`, `Category`, `Vendor`, `Product`, `ProductVariant`,
   then the rest). **No loader is written yet** — writing one is part of
   doing this drill for real, and it should be written against an actual
   restore rather than in advance of one.
4. Assert four things, and write the answers down:
   - row counts match the manifest
   - the newest order is present, with its lines and its payment
   - a known product's price is exactly what it was
   - `npm run build && npm start` serves the shop against the copy
5. **Time it.** The number from the clock is the recovery time, and it
   is the only figure in this document that matters when something has
   actually gone wrong.

Record the date, the time taken and anything that surprised you at the
foot of this file. A drill with no written outcome is a drill nobody can
rely on having happened.

### Drill log

| Date | By | Restored from | Time | Outcome |
| --- | --- | --- | --- | --- |
| — | — | — | — | Not yet performed |

---

## Scheduling it

Nothing schedules the exporter today, and a backup that depends on
somebody remembering is not a backup either.

- **On the Mac:** a `launchd` agent running it nightly. Simplest, and it
  only runs when the machine is awake — which is the catch.
- **On Vercel:** not suitable. The cron runtime has no `pg_dump`, a
  function has a time limit, and the output has nowhere local to land.
- **Once Pro is on:** Supabase takes the daily copy and this becomes the
  weekly off-platform one, which a reminder can carry until it is worth
  automating.
