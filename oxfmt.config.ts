import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: ["aube-lock.yaml", "mods/*/hooks/register.mjs"],
  sortImports: true,
});
