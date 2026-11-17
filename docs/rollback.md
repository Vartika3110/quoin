# Rolling back

Closes DEP-11 in `QUOIN_LAUNCH_READINESS.md`, which was open as
"Vercel supports instant rollback; undocumented and undrilled". This is
the documentation. **It is still undrilled** — nobody has performed one,
and the first time should not be during an incident. Do a drill on a
quiet afternoon and append the date at the bottom.

## Decide first: is the code the problem?

Rolling back reverts the application. It does not revert:

- **The database.** Migrations stay applied. See below.
- **Environment variables.** A rollback serves the old code with the
  *current* variables.
- **Anything a dashboard controls** — Razorpay's webhook subscription,
  Supabase Auth settings, the catalogue itself.

So if the symptom is "online payment disappeared from checkout", a
rollback will not help: that gate reads `RAZORPAY_WEBHOOK_SECRET`, which
is a variable, not code. Check `/api/v1/health` before reverting
anything.

## Rolling back the deployment

Vercel → the `quoin` project → Deployments. Find the last Production
deployment that was good, open it, and use **Promote to Production** (or
Instant Rollback where offered). It serves an already-built artefact, so
it takes seconds and cannot fail a build.

This does not change `main`. The repository and the live site are now
out of step, which is fine for an hour and dangerous for a week: the
next merge to `main` deploys forward again and takes the bad commit with
it. So, same day:

```
git revert <bad-sha>          # a revert commit, not a force-push
git push origin HEAD:main
```

`main` is the production branch and pushing to it deploys. Never
force-push it.

## If a migration is involved

This is the case that is not instant, and the reason to check before
reverting rather than after.

Prisma migrations are applied forward and are not reversed by promoting
an older deployment. A migration that only **adds** a nullable column or
a table is safe to leave in place while older code runs — the old code
ignores it. A migration that **drops** or **renames** a column, or adds
a `NOT NULL` without a default, is not: the old code queries a shape
that no longer exists, and rolling back turns a bug into an outage.

For those, the order is:

1. Promote the older deployment, accepting that it is broken, or put the
   site into whatever maintenance state is least bad.
2. Write a forward migration that restores the shape the old code needs.
   **Forward, not a hand-edit** — `prisma migrate` is the record of what
   production looks like, and an undocumented `ALTER TABLE` makes the
   next migration fail for somebody else.
3. Deploy that.

In practice this means: prefer a fix-forward to a rollback whenever a
migration shipped with the bad deploy.

## Restoring data

A rollback is for code. If data is wrong — a bad import, a destructive
script — the tool is the database's own point-in-time recovery, in
Supabase, not Vercel.

That is **ORD-10 and ORD-12 in the readiness document and both are still
open**: nobody has confirmed PITR is enabled, and no restore has ever
been performed. Until that is done there is no data rollback at all,
documented or otherwise. It is the single largest hole in this runbook
and it cannot be closed from the repository.

## The order, when it is urgent

1. `/api/v1/health` — is a variable missing rather than the code wrong?
2. Vercel → Deployments → promote the last good Production deployment.
3. Check the site.
4. `git revert` the bad commit and push to `main` the same day.
5. Write down what happened.

## Drill log

| Date | Who | What was drilled | Result |
| :-- | :-- | :-- | :-- |
| — | — | Not yet drilled | — |
