/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@soundwithme/types",
    "@soundwithme/validation",
    "@soundwithme/constants",
    "@soundwithme/realtime-contracts",
    "@soundwithme/ui",
  ],
  // socket.io's endpoint is "/socket.io/" — keep the slash.
  skipTrailingSlashRedirect: true,
  // Don't tell visitors what the server runs on.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No other site may frame the app (clickjacking a host into kicking
          // someone or handing the room over).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The origin only, never paths (room ids, invite codes) — YouTube's
          // embed still gets the origin it needs.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The mic is for karaoke on this site only; nothing needs the camera or location.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
    ];
  },
  // Same-origin proxy to the API, so the app also works behind a single
  // tunnel/host (e.g. testing from another network). See api-client.ts.
  async rewrites() {
    const api = process.env.API_PROXY_TARGET ?? "http://localhost:4000";
    return [
      { source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` },
      { source: "/socket.io/", destination: `${api}/socket.io/` },
      { source: "/socket.io/:path+", destination: `${api}/socket.io/:path+` },
    ];
  },
};

export default nextConfig;
