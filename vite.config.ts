import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Pre-bundle the locally-linked music-json (and its ajv dep), which Vite
  // skips for linked packages by default.
  optimizeDeps: {
    include: ["music-json", "music-roll"],
  },
});
