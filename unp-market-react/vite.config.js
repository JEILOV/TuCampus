// vite.config.js
import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // ── Vitest ───────────────────────────────────────────────
  test: {
    environment: "node",   // los servicios no necesitan DOM
    globals:     true,     // describe/it/expect sin imports
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include:  ["src/services/**", "src/utils/**"],
      exclude:  ["src/utils/imageUtils.js"], // usa Canvas/DOM — fuera de scope
    },
  },
});