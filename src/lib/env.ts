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
        SHOW_SOURCE_IMAGES: process.env.SHOW_SOURCE_IMAGES === "1",
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
  if (!isBuildPhase && env.NODE_ENV === "production" && !env.MSG91_AUTH_KEY) {
    throw new Error(
      "MSG91_AUTH_KEY is required in production — refusing to start with " +
        "the console OTP sender, which prints login codes to the server log.",
    );
  }

  return env;
}

export const env = load();
