import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The dev overlay defaults to bottom-left, directly on top of the
     mobile bottom nav's first tab. Moved so the shell can be reviewed. */
  devIndicators: {
    position: "top-right",
  },
};

export default nextConfig;
