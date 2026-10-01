const { withAxiom } = require("next-axiom")

/** @type {import('next').NextConfig} */
const nextConfig = withAxiom({
  experimental: {
    serverActions: true,
  },
  images: {
    domains: ["aaah0mnbncqtinas.public.blob.vercel-storage.com"],
    unoptimized: true,
  },
  // SUPER BEER PONG: tells the game page the leaderboard API exists on this origin
  // (static copies of the game never probe it, so they log no 404s).
  headers: async () => [
    {
      source: "/beerpong/:path*", // also matches /beerpong itself
      headers: [{ key: "Set-Cookie", value: "bp_api=1; Path=/; Max-Age=604800; SameSite=Lax" }],
    },
  ],
  rewrites: async () => [
    {
      source: "/privacy",
      destination: "https://api.emojis.sh/assets/privacy",
      basePath: false,
    },
    {
      source: "/terms",
      destination: "https://api.emojis.sh/assets/terms",
      basePath: false,
    },
    // SUPER BEER PONG: single-file game built to public/beerpong/index.html
    { source: "/beerpong", destination: "/beerpong/index.html" },
    { source: "/beerpong/", destination: "/beerpong/index.html" },
  ],
})

module.exports = nextConfig
