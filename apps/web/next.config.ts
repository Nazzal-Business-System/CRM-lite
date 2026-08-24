import { DEFAULT_LOCAL_API_ORIGIN } from "@nbs/shared";
import type { NextConfig } from "next";

function resolveApiOrigin(): string {
  const configured = process.env.API_URL?.trim();
  if (
    configured &&
    (configured.startsWith("http://") || configured.startsWith("https://"))
  ) {
    return configured.replace(/\/$/, "").replace("://localhost", "://127.0.0.1");
  }
  return DEFAULT_LOCAL_API_ORIGIN;
}

const apiOrigin = resolveApiOrigin();

const nextConfig: NextConfig = {
  transpilePackages: ["@nbs/shared"],
  devIndicators: false,
  agentRules: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
