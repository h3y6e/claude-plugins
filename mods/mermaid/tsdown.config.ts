import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/register.tsx",
  outDir: "hooks",
  clean: false,
  platform: "neutral",
  fixedExtension: true,
  // Claude Code reads $, on and next by name and refuses a module that renames them
  minify: { mangle: false },
  copy: { from: "node_modules/pele/LICENSE", rename: "LICENSE.pele" },
});
