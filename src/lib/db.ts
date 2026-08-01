import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * Prisma client singleton.
 *
 * Next dev reloads modules on every edit; without caching on `globalThis`
 * each reload opens a fresh connection pool and Postgres runs out of
 * connections within a few minutes of editing.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
