import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The Lute audit backend (src/server.ts) runs on :8788. Vite proxies /api to it so the
// real audit flow works in dev; everything else the backend doesn't implement is served
// by the demo adapter in src/lib/api.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5273,
    proxy: {
      "/api": { target: "http://localhost:8788", changeOrigin: true },
    },
  },
});
