import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

// Separate from vite.config.ts on purpose: that file drives the Tauri /
// GitHub Pages app build (env-dependent target/minify/sourcemap, multi-entry
// rollupOptions) and none of that matters for unit tests, so this config
// stays standalone rather than risking a merge. Vitest picks this file up
// automatically (it takes priority over vite.config.ts) via `npm test`.
//
// The wire codecs under test are plain .ts, but a couple of them import
// "../i18n" (a .tsx module) for its `tr()` helper. That helper is pure
// (module-level string lookup, no rendering), so `environment: "node"` is
// enough — no jsdom/happy-dom needed. The react plugin is only here so the
// .tsx import transforms the same way it does for the real app build.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
