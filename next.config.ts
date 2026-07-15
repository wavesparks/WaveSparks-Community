import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
