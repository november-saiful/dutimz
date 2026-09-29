import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every page's canonical URL ends in a slash (`/news/<slug>/`, `/category/<slug>/`,
  // `/statistics/`), and public/_redirects normalises requests to that same shape, so the
  // trailing-slash form is this site's canonical one. Page routes are therefore normalised
  // upwards too rather than downwards, so the redirect the framework issues and the one the
  // redirects file issues cannot point at each other.
  trailingSlash: true,
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
