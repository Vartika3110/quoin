import type { NextConfig } from "next";

/**
 * The host catalogue imagery is served from.
 *
 * Read from `SUPABASE_URL` rather than written out, so a project move is
 * one environment variable and not a code change — but it does mean the
 * variable has to be present **at build time**, not only at runtime.
 * Leave it unset on Vercel and every generated product tile 400s from
 * the image optimiser while the bucket itself serves them perfectly —
 * a confusing way to find out.
 *
 * Narrowed to the public object path: the optimiser should be willing to
 * fetch catalogue art and nothing else from that host, least of all the
 * signed URLs the private uploads bucket mints.
 */
const supabaseHost = process.env.SUPABASE_URL
  ? new URL(process.env.SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  /* The dev overlay defaults to bottom-left, directly on top of the
     mobile bottom nav's first tab. Moved so the shell can be reviewed. */
  devIndicators: {
    position: "top-right",
  },

  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [
          /* The fallback, and the reason it exists.
 
             With `SUPABASE_URL` absent at build time this list was empty,
             which makes the optimiser reject every catalogue image with a
             400 — about 1,286 products, 41% of the shelf, blank in
             production while the bucket served them perfectly. It is the
             failure the note above predicted, and it happened anyway:
             the variable was present in the project's environment and
             still did not reach the build, which is a thing that cannot
             be diagnosed from the symptom.
 
             So the empty list is no longer a state this config can be in.
             Narrowed the same way the exact-host pattern is — to the
             public object path, never the signed URLs the private uploads
             bucket mints — so the widening is from "one Supabase project"
             to "the public read path of any Supabase project", on a URL
             that only this application's own data can produce.
 
             A correctly configured deployment never reaches this branch
             and stays pinned to its own host. */
          {
            protocol: "https",
            hostname: "*.supabase.co",
            pathname: "/storage/v1/object/public/**",
          },
        ],
  },
};

export default nextConfig;
