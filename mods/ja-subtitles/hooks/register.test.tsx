import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const reply = (text: string) =>
  ({
    plugin: "ja-subtitles",
    component: "AssistantMessage",
    surface: "terminal",
    requestId: "m1",
    props: { text, isFirstOfReply: true },
  }) as const;

const source = (prompt: string) =>
  prompt.match(
    /<\|plamo:tag\|>input<\|plamo:msg\|>([^<]*)<\|plamo:tag\|>output<\|plamo:key\|>lang<\|plamo:val\|>ja<\|plamo:msg\|>$/,
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
  on("ui.render", { component: "AssistantMessage" }, ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>{e.props.text}</Text>;
  });
  return { prompts, toasts };
};

test("when an English reply is drawn, the engine draws its Japanese translation with the original folded to a dim italic first line below", async ($, on) => {
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
  "when an endpoint and a model are configured, translations are requested from them",
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

test("when the folded original is pressed, it unfolds dimmed below the translation", async ($, on) => {
  // Arrange
  engine(on, { "I fixed the tests.": "テストを修正しました。" });
  const ui = await $.ui.mount(reply("I fixed the tests."));

  // Act
  await $.ui.press({ plugin: "ja-subtitles", key: "original" });

  // Assert
  expect((await ui.find({ type: "Button" }))?.props.label).toBe("▾ 原文");
  const original = await ui.find({ type: "Markdown" });
  expect(original?.text).toBe("I fixed the tests.");
  expect(original?.props.dimColor).toBe(true);
  await ui.unmount();
});

test("when a reply holds a code block, only the prose around it is translated", async ($, on) => {
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

test("when a reply follows a prompt and an earlier translation, the prompt goes as context and the earlier pair as history", async ($, on) => {
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

test("when a reply is drawn off screen, it is not sent for translation", async ($, on) => {
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

test("when more paragraphs wait than the cap, the newest go first and the oldest are dropped", async ($, on) => {
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

test("when a reply holds only Japanese and paragraphs without Latin letters, it is drawn as written without a translation", async ($, on) => {
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

test("when the translation server fails, the reply stays as written with one toast however often it is drawn, and a draw after it recovers translates", async ($, on) => {
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
  expect(toasts[0]).toMatch(/^ja-subtitles: Error: .*503 model not loaded$/);
  expect((await ui.find({ type: "Text" }))?.text).toBe("テストを修正しました。");
  await ui.unmount();
});

test("while a reply streams, each finished English paragraph is translated before the response ends", async ($, on) => {
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
