/** @type {import('next').NextConfig} */

// When building for the Tauri desktop shell we produce a fully static export
// (a folder of HTML/JS the desktop app loads from disk). Normal web dev/build
// is unchanged — this only kicks in when BUILD_TARGET=desktop.
const isDesktop = process.env.BUILD_TARGET === "desktop";

const nextConfig = {
  reactStrictMode: true,
  ...(isDesktop
    ? {
        output: "export",          // emit static site to ./out
        images: { unoptimized: true },
        trailingSlash: true,       // route/ -> route/index.html for file:// loading
      }
    : {}),
};

export default nextConfig;
