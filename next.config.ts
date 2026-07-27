import type { NextConfig } from "next";

const sharpRuntimeFiles = [
  "./node_modules/.pnpm/@img+sharp-linux-x64@0.35.*/node_modules/@img/sharp-linux-x64/**/*",
  "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.3.*/node_modules/@img/sharp-libvips-linux-x64/**/*",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/org/\\[slug\\]/spaces/\\[spaceId\\]/link-preview": sharpRuntimeFiles,
    "/api/org/\\[slug\\]/spaces/\\[spaceId\\]/post-images/upload":
      sharpRuntimeFiles,
  },
  async redirects() {
    return [
      {
        source: "/org/wavespark",
        destination: "/org/wavesparks",
        permanent: true,
      },
      {
        source: "/org/wavespark/:path*",
        destination: "/org/wavesparks/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
