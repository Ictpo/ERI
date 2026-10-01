/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the built UI in out/ is served by the FastAPI backend
  // (single monolithic server for the desktop exe and the monolith run mode).
  output: "export",
  // Emit route/index.html files so plain static file servers resolve routes.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
