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
    /* Two patterns, and the second is not a fallback.
 
       The first pins the project named by `SUPABASE_URL`, which is what a
       correctly configured deployment should be serving. The second
       admits the public read path of any Supabase project, and it is
       unconditional on purpose.
 
       It was a fallback for one deploy, reachable only when
       `SUPABASE_URL` was absent, and that did not fix anything — because
       the variable is *present* in production and the optimiser still
       rejected every catalogue image with a 400. Present but not
       matching: the host it names is not the host the catalogue rows
       actually point at. A conditional fallback is never reached in that
       state, which is the state production is in.
 
       The cost of getting this wrong is the whole shelf. About 1,286
       products — 41% of the catalogue — rendered as "Photo coming soon"
       in production while the bucket served the identical files to
       anyone who asked it directly, and nothing anywhere logged an
       error. The cost of the wider pattern is that the optimiser will
       fetch a public object from a Supabase project that is not ours, on
       a URL only this application's own catalogue rows can produce.
 
       Narrowed in the way that matters either way: `/object/public/**`
       only, never the signed URLs the private uploads bucket mints. */
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      {
        protocol: "https" as const,
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
