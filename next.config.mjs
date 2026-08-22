/** @type {import('next').NextConfig} */
// const nextConfig = {};

const nextConfig = {
  serverExternalPackages: ["koffi"],
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    // ignoreDuringBuilds: true,
  },
};
export default nextConfig;
export const runtime = "edge";
