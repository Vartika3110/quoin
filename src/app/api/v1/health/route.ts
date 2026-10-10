import { timingSafeEqual } from "node:crypto";
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
 *
 * That was once the whole argument for leaving it open, and it is not
 * enough. Presence, length, the deployed commit and the region together
 * describe the deployment well enough to be worth having, and `?deep`
 * ran a database query for anyone who asked. So the detail now needs
 * `Authorization: Bearer $CRON_SECRET` and an unauthenticated caller gets
 * `{ ok: true }` — which is all a liveness probe or an uptime pinger ever
 * wanted. Fails closed: with no `CRON_SECRET` set, nobody sees the detail.
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

/**
 * Whether the caller may see the detail.
 *
 * Shares `CRON_SECRET` with the scheduled jobs rather than introducing a
 * third secret: both are "this is the operator, not a customer", and one
 * variable to rotate is better than two to forget. Read from
 * `process.env` directly and compared by hand because this route
 * deliberately imports neither `env.ts` nor `src/lib/cron.ts` — the whole
 * point of it is to answer when `env.ts` is the thing that is broken.
 *
 * Fails closed: no secret configured means nobody is the operator.
 */
function isOperator(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  /* The public answer: alive, and nothing else.
   *
   * This route used to return all of the below to anyone who asked. It
   * never returned a secret's *value* and was carefully written not to —
   * but presence, byte-length, the deployed commit and the region are
   * still a free map of the deployment for someone deciding whether it is
   * worth attacking, and `?deep` additionally ran a database query and
   * handed back module-initialisation errors on an unauthenticated URL.
   * A liveness probe needs none of that; an operator debugging a bad
   * deploy needs all of it. So it is split, and the split is the header. */
  if (!isOperator(request)) {
    return NextResponse.json({ ok: true });
  }

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

      /* Everything below was added after an audit found this route
         reporting five variables while naming not one of the four that
         were actually misconfigured in production. A health check that
         omits the things most likely to be wrong is a health check that
         reads green through an outage — which is exactly what happened:
         payments were failing on a mismatched webhook secret for three
         weeks and this endpoint said `ok: true` throughout.
         `SUPABASE_URL` in particular is listed because it is needed at
         *build* time for the image optimiser's allow-list, and its
         absence shows up as broken product photographs rather than as
         anything resembling a configuration error. */
      RAZORPAY_KEY_ID: describe("RAZORPAY_KEY_ID"),
      RAZORPAY_KEY_SECRET: describe("RAZORPAY_KEY_SECRET"),
      RAZORPAY_WEBHOOK_SECRET: describe("RAZORPAY_WEBHOOK_SECRET"),
      /* Phone sign-in, which is five variables across two integrations
         and so the easiest thing in this deploy to half-configure.
         Supabase Auth generates and checks the code; the Send SMS Hook
         secret is what lets Supabase call this app to deliver it; the
         three `WHATSAPP_*` are what carry it to the handset. Any one of
         them missing is a customer staring at a code box.

         These replaced `MSG91_AUTH_KEY`/`MSG91_TEMPLATE_ID`, which this
         route reported for weeks after MSG91 stopped being the delivery
         path — a health check asking for credentials nobody needs, while
         silent about the ones that had taken their place. Reporting the
         wrong variables is worse than reporting none: it invites
         somebody to go and register for DLT to satisfy it. */
      SUPABASE_ANON_KEY: describe("SUPABASE_ANON_KEY"),
      SUPABASE_SMS_HOOK_SECRET: describe("SUPABASE_SMS_HOOK_SECRET"),
      WHATSAPP_PHONE_NUMBER_ID: describe("WHATSAPP_PHONE_NUMBER_ID"),
      WHATSAPP_ACCESS_TOKEN: describe("WHATSAPP_ACCESS_TOKEN"),
      WHATSAPP_OTP_TEMPLATE: describe("WHATSAPP_OTP_TEMPLATE"),
      GOOGLE_CLIENT_ID: describe("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: describe("GOOGLE_CLIENT_SECRET"),
      OPENAI_API_KEY: describe("OPENAI_API_KEY"),
      SUPABASE_URL: describe("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: describe("SUPABASE_SERVICE_ROLE_KEY"),
      SUPABASE_STORAGE_BUCKET: describe("SUPABASE_STORAGE_BUCKET"),
      SUPABASE_PUBLIC_BUCKET: describe("SUPABASE_PUBLIC_BUCKET"),
      CRON_SECRET: describe("CRON_SECRET"),
      SITE_URL: describe("SITE_URL"),
      SHOW_SOURCE_IMAGES: describe("SHOW_SOURCE_IMAGES"),
    },
  });
}
