import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = (name: string) =>
  join(dirname(fileURLToPath(import.meta.url)), "node_modules", name);
/**
 * The open-source voice (Piper) runs in the browser on WebAssembly. Its
 * runtime files are served from this site under /tts/ rather than from a
 * CDN, so the Content-Security-Policy can stay 'self'.
 */
const VOICE_FILES: Record<string, string> = {
  "ort-wasm-simd.wasm": join(
    packageDir("onnxruntime-web"),
    "dist/ort-wasm-simd.wasm",
  ),
  "ort-wasm.wasm": join(packageDir("onnxruntime-web"), "dist/ort-wasm.wasm"),
  "piper_phonemize.wasm": join(
    packageDir("@diffusionstudio/piper-wasm"),
    "build/piper_phonemize.wasm",
  ),
  "piper_phonemize.data": join(
    packageDir("@diffusionstudio/piper-wasm"),
    "build/piper_phonemize.data",
  ),
};
function voiceFiles(): Plugin {
  return {
    name: "walk-free-voice-files",
    configureServer(server) {
      server.middlewares.use((q, r, next) => {
        const name = q.url?.match(/^\/tts\/([\w.]+)$/)?.[1];
        const file = name && VOICE_FILES[name];
        if (!file) return next();
        r.setHeader(
          "Content-Type",
          name.endsWith(".wasm")
            ? "application/wasm"
            : "application/octet-stream",
        );
        r.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(VOICE_FILES))
        this.emitFile({
          type: "asset",
          fileName: `tts/${name}`,
          source: readFileSync(file),
        });
    },
  };
}

export default defineConfig({
  plugins: [react(), voiceFiles()],
  // The voice worker loads its runtime with dynamic imports.
  worker: { format: "es" },
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
