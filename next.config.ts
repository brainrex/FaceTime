import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Required: Xmax SDK uses browser APIs not compatible with SSR
  transpilePackages: ["@xmaxai/web-sdk"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't attempt to bundle browser-only WebRTC/WebGL dependencies on server
      config.externals = config.externals || [];
      (config.externals as string[]).push("@xmaxai/web-sdk");
    }
    return config;
  },
};

export default nextConfig;
