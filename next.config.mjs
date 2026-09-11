/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Dockerfile sets NEXT_OUTPUT_STANDALONE so the image only ships the
  // files the server needs. Local `npm run build && npm start` is unchanged.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
