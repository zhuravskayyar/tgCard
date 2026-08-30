import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";

const allowedHosts = [
  "app.cardastika.org",
  ".trycloudflare.com",
  ".localhost.run",
  ".lhr.life",
  ".cfargotunnel.com",
];

const apiProxy = {
  "/api": "http://127.0.0.1:3000",
  "/card-art": "http://127.0.0.1:3000",
};

const cacheableImagePath = /^\/assets\/.*\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const imageCacheControl = "public, max-age=86400, stale-while-revalidate=604800";

function cacheStaticImageResponse(
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void,
) {
  const pathname = (request.url ?? "").split("?", 1)[0] ?? "";
  if (cacheableImagePath.test(pathname)) {
    response.setHeader("Cache-Control", imageCacheControl);
  }
  next();
}

const staticImageCachePlugin: Plugin = {
  name: "cardastika-static-image-cache",
  configureServer(server) {
    server.middlewares.use(cacheStaticImageResponse);
  },
  configurePreviewServer(server) {
    server.middlewares.use(cacheStaticImageResponse);
  },
};

export default defineConfig({
  plugins: [staticImageCachePlugin],
  server: {
    // The fast Telegram launcher adds the configured permanent hostname through
    // Vite's __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS environment variable.
    allowedHosts,
    proxy: apiProxy,
  },
  preview: {
    allowedHosts,
    proxy: apiProxy,
  },
});
