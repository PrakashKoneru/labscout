import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/", destination: "/index.html" },
      { source: "/docs", destination: "/docs.html" },
      { source: "/sponsors", destination: "/sponsors.html" },
      { source: "/hackathon", destination: "/hackathon.html" },
    ];
  },
};

export default nextConfig;
