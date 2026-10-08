-- Supabase Auth becomes the verifier; this table stays the customer.
--
-- `supabaseUserId` holds the `auth.users.id` that signed in. Nullable
-- because every existing account predates Supabase Auth and is linked
-- lazily, on that customer's next sign-in, by matching their verified
-- phone (see `resolveSupabaseUser` in src/lib/auth/supabase-user.ts).
--
-- Deliberately NOT a foreign key to auth.users: that schema belongs to
-- Supabase, which migrates it on its own schedule, and a constraint here
-- would turn their upgrade into our outage.
ALTER TABLE "users"
  ADD COLUMN "supabaseUserId" TEXT;

CREATE UNIQUE INDEX "users_supabaseUserId_key"
  ON "users" ("supabaseUserId");

-- Row-level security on the customer table.
--
-- Honest about what this is: Prisma connects as the table owner and
-- every storefront read is authorised in application code, so these
-- policies are not what protects customer data today — they are a
-- backstop for anything that ever reaches this table holding only the
-- anon or authenticated key, which is exactly what the browser now has
-- since Supabase Auth was added.
--
-- NOT "FORCE ROW LEVEL SECURITY": forcing it would apply these policies
-- to the owner too, and every server-side Prisma query would start
-- returning nothing.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

-- A signed-in customer may read exactly their own row, and no other.
CREATE POLICY "users_select_own" ON "users"
  FOR SELECT
  TO authenticated
  USING ("supabaseUserId" = auth.uid()::text);

-- ...and change only the columns that are theirs to change. Tier, wallet
-- and staff are not: those decide what a customer is charged and what
-- they can reach, and nothing holding an anon-tier key may touch them.
-- A row-level policy cannot restrict columns, so the grant below does.
CREATE POLICY "users_update_own" ON "users"
  FOR UPDATE
  TO authenticated
  USING ("supabaseUserId" = auth.uid()::text)
  WITH CHECK ("supabaseUserId" = auth.uid()::text);

REVOKE ALL ON "users" FROM authenticated;
GRANT SELECT ON "users" TO authenticated;
GRANT UPDATE ("name", "email", "deliveryPhone") ON "users" TO authenticated;

-- No policy for anon at all: a signed-out visitor has no row here and
-- no business reading anyone else's.
REVOKE ALL ON "users" FROM anon;
