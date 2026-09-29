import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.dutimz.com", pathname: "/media/**" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;

// Makes Cloudflare bindings available to server code during `next dev`.
// No bindings are used yet; the call is here so the first binding only
// needs a wrangler.jsonc entry, not a config change.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
