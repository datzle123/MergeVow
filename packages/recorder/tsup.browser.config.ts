import { defineConfig } from "tsup";

export default defineConfig({
  clean: false,
  dts: false,
  entry: { "recorder-init": "src/browser-entry.ts" },
  format: ["iife"],
  globalName: "__mergevowRecorderBundle",
  minify: true,
  noExternal: ["dom-accessibility-api"],
  outDir: "dist/browser",
  outExtension: () => ({ js: ".js" }),
  platform: "browser",
  sourcemap: false,
  splitting: false,
  target: "chrome120",
  treeshake: true,
});
