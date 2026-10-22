import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/register.ts",
  outDir: "hooks",
  clean: false,
  platform: "neutral",
  fixedExtension: true,
  minify: { mangle: false },
  copy: { from: "node_modules/pele/LICENSE", rename: "LICENSE.pele" },
});
