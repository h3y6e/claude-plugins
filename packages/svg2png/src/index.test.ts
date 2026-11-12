import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

import { toPng } from "./index.ts";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==";

const topLeftColour = (png: Buffer) => {
  const chunks: Record<string, Buffer[]> = {};
  for (let i = 8; i < png.length;) {
    const length = png.readUInt32BE(i);
    (chunks[png.toString("ascii", i + 4, i + 8)] ??= []).push(png.subarray(i + 8, i + 8 + length));
    i += 12 + length;
  }
  const bitDepth = chunks.IHDR![0]![8]!;
  const index = inflateSync(Buffer.concat(chunks.IDAT!))[1]! >> (8 - bitDepth);
  return chunks.PLTE![0]!.subarray(index * 3, index * 3 + 3).toString("hex");
};

const engine = (exitCode = 0, stderr = "") => {
  const runs: { argv: string[]; stdin: string }[] = [];
  const $ = {
    process: {
      run: async (argv: string[], { stdin }: { stdin: string }) => {
        runs.push({ argv, stdin });
        return { exitCode, stdout: `data:image/png;base64,${PNG}`, stderr };
      },
    },
  };
  return { $, runs };
};

await test("入れ子の var() とフォールバックを含む SVG を変換すると、magick には値を展開した SVG が渡る", async () => {
  // Arrange
  const { $, runs } = engine();
  const svg =
    '<svg style="--a:var(--b);--b:#123456"><rect fill="var(--a)" stroke="var(--none,var(--b))" color="var(--none,red)"/></svg>';

  // Act
  await toPng($, svg);

  // Assert
  assert.equal(
    runs[0]!.stdin,
    '<svg style="--a:#123456;--b:#123456"><rect fill="#123456" stroke="#123456" color="red"/></svg>',
  );
});

await test("単引用符の style 属性で変数を定義した SVG を変換すると、magick には var() を展開した SVG が渡る", async () => {
  // Arrange
  const { $, runs } = engine();
  const svg = "<svg style='--a:#123456'><rect fill='var(--a)'/></svg>";

  // Act
  await toPng($, svg);

  // Assert
  assert.equal(runs[0]!.stdin, "<svg style='--a:#123456'><rect fill='#123456'/></svg>");
});

await test("テキストに互いを参照する変数定義のような文字列を含む SVG を変換すると、テキストはそのまま magick に渡る", async () => {
  // Arrange
  const { $, runs } = engine();
  const svg = "<svg><text>--a:var(--b);--b:var(--a)</text></svg>";

  // Act
  await toPng($, svg);

  // Assert
  assert.equal(runs[0]!.stdin, svg);
});

await test("magick が 0 以外で終了すると、変換はその stderr を含むエラーで失敗する", async () => {
  // Arrange
  const { $ } = engine(1, "no decode delegate");

  // Act
  const error = await toPng($, "<svg>exit</svg>").catch((e: unknown) => e);

  // Assert
  assert.deepEqual(error, new Error("magick: no decode delegate"));
});

await test("変換し終えた SVG をもう一度変換すると、magick は再実行されない", async () => {
  // Arrange
  const { $, runs } = engine();

  // Act
  await toPng($, "<svg>twice</svg>");
  await toPng($, "<svg>twice</svg>");

  // Assert
  assert.equal(runs.length, 1);
});

await test("変換が失敗した SVG をもう一度変換すると、magick が再実行され、成功すればその結果になる", async () => {
  // Arrange
  const failing = engine(1, "not installed");
  const { $, runs } = engine();
  await toPng(failing.$, "<svg>retry</svg>").catch(() => {});

  // Act
  const png = await toPng($, "<svg>retry</svg>");

  // Assert
  assert.equal(runs.length, 1);
  assert.equal(png, PNG);
});

await test("変換中に最初の呼び出しの magick が中断されると、同時に同じ SVG を変換した 2 つ目の呼び出しは PNG を得る", async () => {
  // Arrange
  const aborted = {
    process: {
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("$.process.run(magick) aborted");
      },
    },
  };
  const { $ } = engine();

  // Act
  const [first, second] = await Promise.allSettled([
    toPng(aborted, "<svg>aborted</svg>"),
    toPng($, "<svg>aborted</svg>"),
  ]);

  // Assert
  assert.equal(first.status, "rejected");
  assert.deepEqual(second, { status: "fulfilled", value: PNG });
});

await test("magick が data URL を返すと、変換結果はカンマより後ろの base64 になる", async () => {
  // Arrange
  const { $ } = engine();

  // Act
  const png = await toPng($, "<svg>base64</svg>");

  // Assert
  assert.equal(png, PNG);
});

await test("実際の magick で、CSS カスタムプロパティで塗った SVG を変換すると、その色で塗られた PNG になる", async () => {
  // Arrange
  const $ = {
    process: {
      run: async (argv: string[], { stdin }: { stdin: string }) => {
        const { status, stdout, stderr } = spawnSync(argv[0]!, argv.slice(1), {
          input: stdin,
          encoding: "utf8",
        });
        return { exitCode: status!, stdout, stderr };
      },
    },
  };
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4" style="--fill:#ff0000"><rect width="4" height="4" fill="var(--fill)"/></svg>';

  // Act
  const png = Buffer.from(await toPng($, svg), "base64");

  // Assert
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(topLeftColour(png), "ff0000");
});
