import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@xmaxai/web-sdk"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      (config.externals as string[]).push("@xmaxai/web-sdk");
    }
    return config;
  },
};

export default nextConfig;
