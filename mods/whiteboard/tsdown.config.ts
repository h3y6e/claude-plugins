import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/register.tsx",
  outDir: "hooks",
  clean: false,
  platform: "neutral",
  fixedExtension: true,
  // Claude Code は $・on・next を名前で参照するので、これらを改名したモジュールは読み込まれない
  minify: { mangle: false },
  deps: { neverBundle: ["claude-code"] },
});
