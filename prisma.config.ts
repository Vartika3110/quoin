/* Must be first, and it is the whole reason this import exists:
   declaring a `prisma.config.ts` turns Prisma's own `.env` loading
   *off* ("Prisma config detected, skipping environment variable
   loading"), so without this the CLI starts with a bare environment and
   `prisma migrate deploy` fails validating the schema with
   "Environment variable not found: DIRECT_DATABASE_URL" — a message
   that reads like a missing value rather than a file nobody read. This
   is the same side-effecting loader every `tsx` script imports, and it
   never overwrites a value the real environment already set, so CI and
   production are unaffected. */
import "./src/lib/load-env-file";

import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Replaces the `prisma` key in package.json, which is deprecated and
 * removed in Prisma 7.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
