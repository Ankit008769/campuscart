import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared workspace package shipped as TypeScript source.
  transpilePackages: ["@campuscart/core"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
