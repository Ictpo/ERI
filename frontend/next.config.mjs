/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the built UI in out/ is served by the FastAPI backend
  // (single monolithic server for Docker and the desktop exe).
  output: "export",
  // Emit route/index.html files so plain static file servers resolve routes.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
