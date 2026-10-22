import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "promise"],
  ignorePatterns: ["mods/*/hooks/register.mjs"],
  options: {
    typeAware: true,
    // The mods API types exist only where Claude Code wrote them on --plugin-dir, never in CI
    typeCheck: !process.env.CI,
    reportUnusedDisableDirectives: "error",
  },
});
