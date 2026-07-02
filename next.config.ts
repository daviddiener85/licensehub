import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB; intake submissions bundle several phone-camera photos
      // (ID photo, licence disk, proof of address) in a single request.
      bodySizeLimit: "75mb",
    },
  },
};

export default nextConfig;
