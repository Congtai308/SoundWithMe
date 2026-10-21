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
