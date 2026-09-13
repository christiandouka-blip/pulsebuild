import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Next.js parse limit for a 4 MB file plus multipart overhead (4352 KiB).
      // This does not override Vercel's 4.5 MB Function request ceiling.
      bodySizeLimit: "4352kb",
    },
  },
};

export default nextConfig;
