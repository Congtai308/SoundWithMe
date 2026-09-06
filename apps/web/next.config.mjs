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
};

export default nextConfig;
