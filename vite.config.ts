import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
  // The 3D workspace (three.js) loads only after sign-in.
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // The 3D libraries change far less often than the app: in their own
        // chunk, most deploys don't make returning visitors download them again.
        // React gets its own shared chunk so the public pages, which also
        // use it, never preload the 3D libraries.
        manualChunks(id) {
          // Vite's preload helper is used by every page: keep it out of the
          // 3D chunk, or the landing page would preload three.js.
          if (id.includes("vite/preload-helper")) return "vendor-react";
          if (/node_modules\/(three|@react-three)\//.test(id))
            return "vendor-3d";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return "vendor-react";
        },
      },
    },
  },
});
