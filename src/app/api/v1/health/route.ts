import { NextResponse } from "next/server";

/**
 * GET /api/v1/health
 *
 * Says whether the deployment is configured, when the app itself cannot
 * start to say anything. `env.ts` throws while its module is being
 * evaluated, so a misconfigured variable takes down every route before
 * any handler runs and the only account of what went wrong is in the
 * host's logs.
 *
 * This route therefore imports neither `env.ts` nor `db.ts`, and reads
 * `process.env` directly. Nothing here can throw.
 *
 * It reports presence and length, never a value. The names are already
 * public in `.env.example`; the values are the secrets, and none of them
 * is returned or logged.
 */
export const dynamic = "force-dynamic";

function describe(name: string) {
  const raw = process.env[name];
  return {
    present: raw !== undefined,
    empty: raw === "",
    length: raw?.length ?? 0,
  };
}

/**
 * Loads a module that runs work at import time and reports what it threw.
 *
 * The message only: these are this application's own validation errors,
 * and Prisma masks credentials in its own. A stack trace would name paths
 * inside the bundle and say nothing more about the cause.
 */
async function probe(name: string, load: () => Promise<unknown>) {
  try {
    await load();
    return { loaded: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { loaded: false, error: message.split("\n").slice(0, 4).join(" ").slice(0, 400) };
  }
}

export async function GET(request: Request) {
  const secret = process.env.AUTH_SECRET ?? "";
  const deep = new URL(request.url).searchParams.has("deep");

  const modules = deep
    ? {
        env: await probe("env", () => import("@/lib/env")),
        db: await probe("db", async () => {
          const { db } = await import("@/lib/db");
          await db.$queryRaw`SELECT 1`;
        }),
      }
    : undefined;

  return NextResponse.json({
    modules,
    ok: true,
    nodeEnv: process.env.NODE_ENV ?? null,
    region: process.env.VERCEL_REGION ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    env: {
      DATABASE_URL: describe("DATABASE_URL"),
      DIRECT_DATABASE_URL: describe("DIRECT_DATABASE_URL"),
      AUTH_SECRET: { ...describe("AUTH_SECRET"), longEnough: secret.length >= 32 },
      MSG91_AUTH_KEY: describe("MSG91_AUTH_KEY"),
      SHOW_SOURCE_IMAGES: describe("SHOW_SOURCE_IMAGES"),
    },
  });
}
