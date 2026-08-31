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

export function GET() {
  const secret = process.env.AUTH_SECRET ?? "";

  return NextResponse.json({
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
