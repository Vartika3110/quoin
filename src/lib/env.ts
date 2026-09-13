import { z } from "zod";

/**
 * Environment validation.
 *
 * Fails at boot with a readable message rather than at 2am with
 * `undefined is not a string` inside a JWT signer. Only server code may
 * import this module — it will throw if bundled into the client.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /**
   * Signs session JWTs and peppers OTP hashes. Rotating it invalidates
   * every session and every pending OTP, which is the desired behaviour
   * if it ever leaks.
   */
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  /**
   * SMS delivery. Absent in development, where codes are written to the
   * server log instead — see `sender.ts`. Required in production, and
   * checked below rather than here so local setup stays frictionless.
   */
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),

  /**
   * Razorpay. All three optional, and — unlike MSG91 — there is
   * deliberately no production guard demanding them.
   *
   * The MSG91 guard exists because its fallback does something unsafe:
   * printing login codes to the server log. Payments have no such
   * fallback. With these unset the checkout simply reports that payment
   * is unavailable and takes no money, which is a correct state, not a
   * dangerous one — and it is the state a deploy sits in for the days or
   * weeks that gateway KYC takes. Refusing to boot over it would take a
   * working storefront down to protect against nothing.
   *
   * `RAZORPAY_KEY_ID` is not secret: it is handed to the browser to open
   * the checkout. It is read here rather than as `NEXT_PUBLIC_` so that
   * rotating it is an environment change and not a rebuild, and so there
   * is one source of truth for whether payments are configured at all.
   */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  /**
   * Google sign-in. Both optional, and — like Razorpay and Supabase above,
   * and unlike MSG91 — there is deliberately no production guard demanding
   * them: the unconfigured fallback is simply that the Google button is
   * not shown, which is a safe state rather than a dangerous one. SMS
   * stays the only sign-in method until these are set.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /**
   * Signs the webhook. Set separately in the Razorpay dashboard and
   * unrelated to the API secret above — a deploy can have valid API
   * credentials and still be unable to trust a single webhook, so the
   * handler checks for this one specifically rather than assuming that
   * having keys means having this.
   */
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  /**
   * Renders the competitor product photography captured in
   * `Product.sourceImageUrl`.
   *
   * Off unless explicitly set. Those images belong to the sites they were
   * scraped from and to the manufacturers, and serving them also hotlinks
   * someone else's CDN — fine behind a private demo link, not something to
   * leave on for a public storefront. Turning it on is a deliberate act,
   * which is why it is an environment variable rather than a default.
   */
  /* Anything that is not an explicit yes means no. A strict enum here
     took the whole site down when the variable was present but empty:
     `.default()` fills in an absent value, not an invalid one, so an
     empty string failed validation and every route 500ed at boot. An
     optional display toggle must not be able to do that. */
  SHOW_SOURCE_IMAGES: z
    .string()
    .optional()
    .transform((v) => v === "1" || v?.toLowerCase() === "true"),

  /**
   * Object storage, for Parcha uploads and (later) project documents and
   * product images. All four optional, and unlike MSG91 there is no
   * production guard demanding them — same reasoning as Razorpay just
   * above: with these unset the workbench simply reports that uploads are
   * unavailable, which is correct for the days a bucket is not yet
   * provisioned, not a reason to refuse to boot.
   *
   * A free-form string rather than `z.enum(...)`, deliberately: an enum
   * that rejects an unrecognised value fails validation on an empty
   * string exactly the way `SHOW_SOURCE_IMAGES` explains above, and this
   * one is read by `src/lib/storage/index.ts`, which already falls back
   * safely for anything it does not recognise. Supabase is the only
   * provider implemented today, and is the default when unset.
   */
  /**
   * Reading a Parcha.
   *
   * `OPENAI_API_KEY` is what turns `getParchaReader()` (src/lib/parcha-openai.ts)
   * from the not-configured reader into one that actually reads a
   * photograph or a PDF. Optional, and — like Razorpay and Supabase above,
   * and unlike MSG91 — with it unset the app boots normally and the Parcha
   * workbench simply reports that automatic reading is unavailable, which
   * is a correct state rather than a dangerous one: typing a list still
   * works end to end, and an attached file still goes to a person.
   *
   * Server-only, always. It authenticates spend against a third-party
   * account, so it is treated exactly like `RAZORPAY_KEY_SECRET`: never
   * `NEXT_PUBLIC_`, never in a response body, never in a log line. The
   * browser posts the file to `/api/v1/parcha/extract` and this server
   * makes the OpenAI call — see the security note in that route.
   *
   * The same variable already backed `npm run images:generate`, which runs
   * on a laptop rather than at request time. It is read here now because a
   * request-time feature needs it validated on boot rather than discovered
   * missing mid-request.
   */
  OPENAI_API_KEY: z.string().optional(),
  /**
   * Which model reads the file. Optional; `DEFAULT_PARCHA_MODEL` in
   * `src/lib/parcha-openai.ts` is used when unset.
   *
   * An environment variable rather than a constant because model names
   * age faster than deploys do: a model being retired, or an account not
   * being granted one, must be a dashboard change and not a code change.
   * A free-form string rather than an enum for the reason
   * `SHOW_SOURCE_IMAGES` records above — an enum rejects an empty string,
   * and validation that can fail on a *present but blank* optional
   * variable takes the whole site down for a setting that should only
   * ever degrade one feature.
   */
  OPENAI_MODEL: z.string().optional(),

  /**
   * The site's own origin, for the absolute URLs metadata needs.
   *
   * Open Graph images and canonical links have to be absolute — a
   * `metadataBase` of `http://localhost:3000`, which is what Next falls
   * back to, means every shared Studio link previews a picture nobody
   * else can load. Optional because there is a sensible fallback chain
   * (see `siteOrigin`); set it explicitly on a custom domain, where
   * `VERCEL_URL` names the deployment rather than the site.
   */
  SITE_URL: z.string().optional(),
  /** Set by Vercel. The stable production domain, unlike `VERCEL_URL`,
      which changes with every deployment. */
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),

  STORAGE_PROVIDER: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  /**
   * Bypasses row-level security entirely — every bucket, every row, no
   * policy consulted. Treat exactly like `RAZORPAY_KEY_SECRET`: it must
   * never reach the client, a log line, or a response body. It is what
   * lets the server mint a signed URL for a private bucket on the
   * uploading customer's behalf without that customer ever holding a
   * Supabase credential of their own.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().optional(),
});

type Env = z.infer<typeof schema>;

/**
 * `next build` imports every route module to collect them, which reaches
 * this file. Hosts like Vercel inject environment variables at runtime,
 * not at build time, so failing the build here would be wrong — the
 * module is re-imported on server boot, where validation does run and
 * does throw. Only the build phase is exempt.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

function load(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    if (isBuildPhase) {
      return {
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        AUTH_SECRET: process.env.AUTH_SECRET ?? "",
        NODE_ENV: "production",
        MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY,
        MSG91_TEMPLATE_ID: process.env.MSG91_TEMPLATE_ID,
        MSG91_SENDER_ID: process.env.MSG91_SENDER_ID,
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        SHOW_SOURCE_IMAGES: process.env.SHOW_SOURCE_IMAGES === "1",
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        SITE_URL: process.env.SITE_URL,
        VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
        VERCEL_URL: process.env.VERCEL_URL,
        STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET,
      };
    }

    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;

  /* A production deploy that silently logs OTPs to stdout instead of
     sending them would let anyone with log access take over an account.
     Skipped during the build for the same reason the parse above is:
     `next build` runs with NODE_ENV=production and imports every route to
     collect page data, so enforcing this here would fail the build of any
     deploy whose SMS credentials are supplied at runtime. The check still
     runs on server boot, which is where it does its job. */
  /* No boot guard on MSG91, deliberately, and this is a reversal worth
     recording.

     There used to be one: production refused to start without
     `MSG91_AUTH_KEY`, on the reasoning that booting with the console
     sender would print login codes to the server log. The reasoning was
     right and the guard was still wrong, twice over.

     It checked one variable when the sender needs two, so a deploy with a
     key and no DLT template sailed past it and did exactly the thing it
     existed to prevent — silently, for as long as nobody read the logs.
     And its failure mode was to take the entire storefront down: a
     browsable catalogue, a working cart and a working admin, all 500ing
     because SMS was misconfigured.

     Payments already had the better answer. Razorpay unset does not stop
     the app; checkout reports that payment is unavailable and takes no
     money, which is a correct state rather than a dangerous one. SMS is
     the same shape, so it gets the same treatment: the app boots, the
     catalogue serves, and `isOtpDeliveryAvailable()` in
     `src/lib/auth/sender.ts` makes sign-in report itself unavailable at
     the point of use. `getOtpSender()` refuses outright to return the
     console sender in production, so nothing can leak a code either way. */

  return env;
}

export const env = load();

/**
 * Where this deployment lives, as an absolute origin.
 *
 * `metadataBase` needs one: Open Graph images and canonical links must be
 * absolute, and Next's own fallback is `http://localhost:3000`, which
 * would make every shared Studio link preview a picture only the author's
 * machine can load.
 *
 * The chain, most specific first:
 *
 *  1. `SITE_URL`, set by hand. The only one that is right on a custom
 *     domain, which is why it wins.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's stable production
 *     hostname. Correct for a project served on its `.vercel.app` domain.
 *  3. `VERCEL_URL` — this *deployment's* hostname. Changes every deploy,
 *     so it is a preview-only answer, and that is exactly what it is for:
 *     a preview's OG images should point at the preview.
 *  4. localhost, in development.
 *
 * Returns a `URL`, so a malformed value fails here rather than producing
 * a subtly wrong tag on every page.
 */
export function siteOrigin(): URL {
  const explicit = env.SITE_URL?.trim();
  if (explicit) return new URL(explicit);

  const vercel =
    env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  /* Vercel supplies a bare hostname, never a scheme. */
  if (vercel) return new URL(`https://${vercel.replace(/^https?:\/\//, "")}`);

  return new URL("http://localhost:3000");
}
