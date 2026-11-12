import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const reply = (text: string) =>
  ({
    plugin: "dubbed",
    component: "AssistantMessage",
    surface: "terminal",
    requestId: "m1",
    props: { text, isFirstOfReply: true },
  }) as const;

const source = (prompt: string) =>
  prompt.match(
    /<\|plamo:tag\|>input<\|plamo:msg\|>([^<]*)<\|plamo:tag\|>output<\|plamo:key\|>lang<\|plamo:val\|>[a-z]+<\|plamo:msg\|>$/,
  )![1]!;

const engine = (
  on: On,
  dictionary: Record<string, string>,
  server: { status: number; gate?: Promise<void> } = { status: 200 },
) => {
  const prompts: string[] = [];
  const toasts: string[] = [];
  on("ui.toast", (_, e) => {
    toasts.push(e.text);
    return { value: undefined };
  });
  on("http.fetch", async (_, e) => {
    const { prompt } = JSON.parse(e.init!.body!) as { prompt: string };
    prompts.push(prompt);
    await server.gate;
    return {
      value: {
        status: server.status,
        ok: server.status === 200,
        headers: {},
        text:
          server.status === 200
            ? JSON.stringify({ choices: [{ text: ` ${dictionary[source(prompt)]}` }] })
            : "model not loaded",
      },
    };
  });
  on("prompt.submit", (_, e) => ({ text: e.text }));
  on("ui.render", { component: ["AssistantMessage", "CommandOutput"] }, ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>{e.props.text}</Text>;
  });
  return { prompts, toasts };
};

test("英語の返信が描画されると、エンジンは日本語訳を描画し、その下に原文を1行目だけの薄い斜体に折りたたんで表示する", async ($, on) => {
  // Arrange
  engine(on, {
    "I fixed the tests.": "テストを修正しました。",
    "All pass.": "すべて通過しました。",
  });

  // Act
  const ui = await $.ui.mount(reply("I fixed the tests.\n\nAll pass."));

  // Assert
  expect((await ui.find({ type: "Text", text: /テスト/ }))?.text).toBe(
    "テストを修正しました。\n\nすべて通過しました。",
  );
  const fold = await ui.find({ type: "Button" });
  expect(fold?.props).toMatchObject({ label: "▸ 原文", dimColor: true });
  const headline = await ui.find({ type: "Text", text: /^I fixed/ });
  expect(headline?.text).toBe("I fixed the tests.");
  expect(headline?.props).toMatchObject({ dimColor: true, italic: true, wrap: "truncate" });
  expect(await ui.find({ type: "Markdown" })).toBeUndefined();
  await ui.unmount();
});

test(
  "エンドポイントとモデルが設定されていると、翻訳のリクエストはそこへ送られる",
  { options: { endpoint: "http://127.0.0.1:9931/v1/completions", model: "plamo-3-translate-2b" } },
  async ($, on) => {
    // Arrange
    const requests: { url: string; model: string }[] = [];
    on("http.fetch", (_, e) => {
      requests.push({ url: e.url, model: (JSON.parse(e.init!.body!) as { model: string }).model });
      return {
        value: {
          status: 200,
          ok: true,
          headers: {},
          text: JSON.stringify({ choices: [{ text: "訳。" }] }),
        },
      };
    });
    on("ui.render", { component: "AssistantMessage" }, ($, e) => {
      const { Text } = $.ui.resolve(e);
      return <Text>{e.props.text}</Text>;
    });

    // Act
    const ui = await $.ui.mount(reply("I fixed the tests."));

    // Assert
    expect(requests).toEqual([
      { url: "http://127.0.0.1:9931/v1/completions", model: "plamo-3-translate-2b" },
    ]);
    await ui.unmount();
  },
);

test("/recap の英語の出力が描画されると、日本語訳が描画され、その下に原文が折りたたまれる", async ($, on) => {
  // Arrange
  engine(on, { "You fixed the tests.": "テストを修正しました。" });

  // Act
  const ui = await $.ui.mount({
    ...reply(""),
    component: "CommandOutput",
    props: { command: "recap", args: "", text: "You fixed the tests.", isErrored: false },
  });

  // Assert
  expect((await ui.find({ type: "Text", text: /テスト/ }))?.text).toBe("テストを修正しました。");
  expect((await ui.find({ type: "Button" }))?.props.label).toBe("▸ 原文");
  await ui.unmount();
});

test("recap 以外のコマンドの英語の出力は、訳さずそのまま描画される", async ($, on) => {
  // Arrange
  const { prompts } = engine(on, {});

  // Act
  const ui = await $.ui.mount({
    ...reply(""),
    component: "CommandOutput",
    props: { command: "cost", args: "", text: "Total cost: $0.01", isErrored: false },
  });

  // Assert
  expect(prompts).toEqual([]);
  expect(await ui.find({ type: "Button" })).toBeUndefined();
  await ui.unmount();
});

test("離席中の英語の recap が追加されると、日本語訳に置き換えて保存される", async ($, on) => {
  // Arrange
  engine(on, { "You fixed the tests.": "テストを修正しました。" });

  // Act
  const stored = await $.session.append({
    message: {
      type: "system",
      name: "away_summary",
      content: [{ type: "text", text: "You fixed the tests." }],
    },
    door: "notice",
    origin: { kind: "engine" },
    uuid: "r1",
  });

  // Assert
  expect(stored.message?.content).toEqual([{ type: "text", text: "テストを修正しました。" }]);
});

test("離席中の recap の段落の一部が訳せないと、recap は原文のまま保存される", async ($, on) => {
  // Arrange
  const server = {
    get status() {
      return prompts.length > 1 ? 503 : 200;
    },
  };
  const { prompts } = engine(on, { "You fixed the tests.": "テストを修正しました。" }, server);

  // Act
  const stored = await $.session.append({
    message: {
      type: "system",
      name: "away_summary",
      content: [{ type: "text", text: "You fixed the tests.\n\nAll pass." }],
    },
    door: "notice",
    origin: { kind: "engine" },
    uuid: "r1",
  });

  // Assert
  expect(stored.message?.content).toEqual([
    { type: "text", text: "You fixed the tests.\n\nAll pass." },
  ]);
});

test("折りたたまれた原文を押すと、訳の下に薄い色で展開される", async ($, on) => {
  // Arrange
  engine(on, { "I fixed the tests.": "テストを修正しました。" });
  const ui = await $.ui.mount(reply("I fixed the tests."));

  // Act
  await $.ui.press({ plugin: "dubbed", key: "original" });

  // Assert
  expect((await ui.find({ type: "Button" }))?.props.label).toBe("▾ 原文");
  const original = await ui.find({ type: "Markdown" });
  expect(original?.text).toBe("I fixed the tests.");
  expect(original?.props.dimColor).toBe(true);
  await ui.unmount();
});

test(
  "翻訳先が英語のとき、日本語の返信は英語で描画され、原文は英語のラベルの下に折りたたまれる",
  { options: { lang: "en" } },
  async ($, on) => {
    // Arrange
    const { prompts } = engine(on, { "テストを修正しました。": "I fixed the tests." });

    // Act
    const ui = await $.ui.mount(reply("テストを修正しました。"));

    // Assert
    expect(prompts[0]).toMatch(/<\|plamo:key\|>lang<\|plamo:val\|>en<\|plamo:msg\|>$/);
    expect((await ui.find({ type: "Text", text: /^I fixed/ }))?.text).toBe("I fixed the tests.");
    expect((await ui.find({ type: "Button" }))?.props.label).toBe("▸ Original");
    await ui.unmount();
  },
);

test(
  "翻訳先が英語のとき、英語の返信は訳さずそのまま描画される",
  { options: { lang: "en" } },
  async ($, on) => {
    // Arrange
    const { prompts } = engine(on, {});

    // Act
    const ui = await $.ui.mount(reply("I fixed the tests."));

    // Assert
    expect(prompts).toEqual([]);
    expect(await ui.find({ type: "Button" })).toBeUndefined();
    await ui.unmount();
  },
);

test("返信にコードブロックがあると、その前後の文章だけが訳される", async ($, on) => {
  // Arrange
  const { prompts } = engine(on, {
    "Run this:": "これを実行してください:",
    "It prints 1.": "1 が出力されます。",
  });

  // Act
  const ui = await $.ui.mount(
    reply("Run this:\n```js\nconsole.log(1)\n```\nIt prints 1.\n```\n```"),
  );

  // Assert
  expect(prompts.map(source)).toEqual(["Run this:", "It prints 1."]);
  expect((await ui.find({ type: "Text" }))?.text).toBe(
    "これを実行してください:\n```js\nconsole.log(1)\n```\n1 が出力されます。\n```\n```",
  );
  await ui.unmount();
});

test("プロンプトと前の訳に続く返信では、プロンプトが文脈として、前の原文と訳の組が履歴として送られる", async ($, on) => {
  // Arrange
  const { prompts } = engine(on, { "First.": "一つ目。", "Second.": "二つ目。" });
  await $.prompt.submit({ text: "テストを直して", wait: false, origin: { kind: "composer" } });
  const first = await $.ui.mount(reply("First."));
  await first.unmount();

  // Act
  const second = await $.ui.mount(reply("Second."));

  // Assert
  expect(prompts[1]).toBe(
    "<|plamo:tag|>dataset<|plamo:msg|>translation" +
      "<|plamo:tag|>context<|plamo:msg|>テストを直して" +
      "<|plamo:tag|>input<|plamo:msg|>First." +
      "<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>ja<|plamo:msg|>一つ目。" +
      "<|plamo:tag|>input<|plamo:msg|>Second." +
      "<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>ja<|plamo:msg|>",
  );
  await second.unmount();
});

test("画面外で描画された返信は、翻訳に送られない", async ($, on) => {
  // Arrange
  const { prompts } = engine(on, { "I fixed the tests.": "テストを修正しました。" });

  // Act
  const ui = await $.ui.mount({
    ...reply("I fixed the tests."),
    props: { text: "I fixed the tests.", isFirstOfReply: true, onScreen: null },
  });

  // Assert
  expect(prompts).toEqual([]);
  await ui.unmount();
});

test("翻訳待ちの段落が上限を超えると、新しい段落から訳され、古い段落は捨てられる", async ($, on) => {
  // Arrange
  const sources = Array.from({ length: 10 }, (_, i) => `Paragraph ${i + 1}.`);
  let release!: () => void;
  const server = { status: 200, gate: new Promise<void>((r) => (release = r)) };
  const { prompts } = engine(on, Object.fromEntries(sources.map((p) => [p, "訳。"])), server);

  // Act
  for (const p of sources) await (await $.ui.mount(reply(p))).unmount();
  release();
  await (await $.ui.mount(reply("Paragraph 10."))).unmount();

  // Assert
  expect(prompts.map(source)).toEqual(["Paragraph 1.", ...sources.slice(2).toReversed()]);
});

test("返信が日本語の段落とラテン文字を含まない段落だけなら、訳さずそのまま描画される", async ($, on) => {
  // Arrange
  const { prompts } = engine(on, {});

  // Act
  const ui = await $.ui.mount(reply("`npm test` はすべて通過しています。\n\n完了\n\n|---|---|"));

  // Assert
  expect(prompts).toEqual([]);
  expect((await ui.find({ type: "Text" }))?.text).toBe(
    "`npm test` はすべて通過しています。\n\n完了\n\n|---|---|",
  );
  await ui.unmount();
});

test("英語の段落にカタカナの語が含まれていても、ひらがながなければ訳される", async ($, on) => {
  // Arrange
  const { prompts } = engine(on, {
    "Open the メニュー page.": "メニューのページを開きます。",
  });

  // Act
  const ui = await $.ui.mount(reply("Open the メニュー page."));

  // Assert
  expect(prompts.map(source)).toEqual(["Open the メニュー page."]);
  expect((await ui.find({ type: "Text" }))?.text).toContain("メニューのページを開きます。");
  await ui.unmount();
});

test("英語の段落のひらがなが「」の中だけにあると、訳される", async ($, on) => {
  // Arrange
  const { prompts } = engine(on, {
    "The button reads 「保存する」 now.": "ボタンの表示は「保存する」になりました。",
  });

  // Act
  const ui = await $.ui.mount(reply("The button reads 「保存する」 now."));

  // Assert
  expect(prompts.map(source)).toEqual(["The button reads 「保存する」 now."]);
  expect((await ui.find({ type: "Text" }))?.text).toContain(
    "ボタンの表示は「保存する」になりました。",
  );
  await ui.unmount();
});

test("翻訳サーバーへのリクエストが失敗すると、何度描画されても返信はそのままでトーストは1回だけ出て、復旧後の描画では訳される", async ($, on) => {
  // Arrange
  const server = { status: 503 };
  const { toasts } = engine(on, { "I fixed the tests.": "テストを修正しました。" }, server);
  const failed = await $.ui.mount(reply("I fixed the tests."));
  await failed.unmount();
  const again = await $.ui.mount(reply("I fixed the tests."));
  const shown = (await again.find({ type: "Text" }))?.text;
  await again.unmount();
  server.status = 200;

  // Act
  const ui = await $.ui.mount(reply("I fixed the tests."));

  // Assert
  expect(shown).toBe("I fixed the tests.");
  expect(toasts).toHaveLength(1);
  expect(toasts[0]).toMatch(/^dubbed: Error: .*503 model not loaded$/);
  expect((await ui.find({ type: "Text" }))?.text).toBe("テストを修正しました。");
  await ui.unmount();
});

test("返信のストリーミング中、書き終わった英語の段落は応答の終了を待たずに訳される", async ($, on) => {
  // Arrange
  const { prompts } = engine(on, { "First paragraph.": "最初の段落。" });
  on("turn.step", async function* () {
    yield { kind: "text", index: 0, text: "First paragraph.\n\nSecond" } as const;
    yield { kind: "text", index: 0, text: " paragraph." } as const;
    return {
      turnId: "t",
      index: 0,
      answer: "First paragraph.\n\nSecond paragraph.",
      toolUses: [],
      stopReason: "end_turn",
      usage: null,
    } as const;
  });
  const stream = $.turn.step({ turnId: "t", index: 0, model: "m", messageCount: 1 });

  // Act
  await stream.next();
  await stream.next();

  // Assert
  expect(prompts.map(source)).toEqual(["First paragraph."]);
});
