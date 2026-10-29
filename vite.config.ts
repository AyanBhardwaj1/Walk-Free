import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
  // The 3D workspace (three.js) loads only after sign-in.
  build: { chunkSizeWarningLimit: 1200 },
});
