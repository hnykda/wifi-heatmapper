/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Dockerfile sets NEXT_OUTPUT_STANDALONE so the image only ships the
  // files the server needs. Local `npm run build && npm start` is unchanged.
  output: process.env.NEXT_OUTPUT_STANDALONE ? "standalone" : undefined,
  // The e2e scripts build into .next-e2e so they can run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
