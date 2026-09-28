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
      : [],
  },
};

export default nextConfig;
