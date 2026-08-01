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
