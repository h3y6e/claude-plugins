import type { On, RenderSurface } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const TOOL = "mcp__napkin__json_render";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==";

const leaf = (
  type: string,
  props: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  type,
  props,
  children: [],
  ...extra,
});

const page = <E extends Record<string, unknown>>(
  elements: E,
  state: Record<string, unknown> = {},
) => ({
  root: "page",
  state,
  elements: {
    page: { type: "Stack", props: {}, children: Object.keys(elements) },
    ...elements,
  },
});

const FORM = page(
  {
    title: leaf("Heading", { text: "リポジトリ設定", level: "h2" }),
    name: leaf(
      "Input",
      { label: "名前", value: { $bindState: "/name" } },
      {
        on: {
          submit: {
            action: "pushState",
            params: { statePath: "/items", value: { $state: "/name" } },
          },
        },
      },
    ),
    list: {
      type: "Stack",
      props: {},
      repeat: { statePath: "/items" },
      children: ["item"],
    },
    item: leaf("Text", { text: { $item: "" } }),
    create: leaf("Button", { label: "作成" }, { on: { press: { action: "create" } } }),
  },
  { name: "", items: ["a"] },
);

const pane = <S extends RenderSurface = "terminal">(surface: S = "terminal" as S) =>
  ({
    plugin: "napkin",
    component: "Pane",
    requestId: "napkin",
    surface,
    props: {
      title: "設定",
      isFocused: true,
      bodyColumns: 60,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  }) as const;

const engine = (on: On) => {
  const opened: string[] = [];
  const prompts: string[] = [];
  const converted: string[] = [];
  const clock = mock.clock(on);
  on("ui.open", (_, e) => {
    opened.push(e.id);
    return { value: { isPlaced: true } };
  });
  on("prompt.submit", (_, e) => {
    prompts.push(e.text);
    return { text: e.text };
  });
  on("process.run", (_, e) => {
    converted.push(e.init!.stdin!);
    return {
      value: {
        exitCode: 0,
        stdout: `data:image/png;base64,${PNG}`,
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  return { opened, prompts, converted, clock };
};

const sent = (prompts: string[]) =>
  JSON.parse(prompts[0]!.slice(prompts[0]!.indexOf("\n") + 1)) as {
    params: Record<string, unknown>;
    state: Record<string, unknown>;
  };

test("ターミナルで、正しい spec を描かせると、ペインにその要素が描かれる", async ($, on) => {
  // Arrange
  const { opened } = engine(on);

  // Act
  const called = await $.tool.call({ tool: TOOL, title: "設定", spec: FORM } as never);
  const ui = await $.ui.mount(pane());

  // Assert
  expect(called).toMatchObject({ result: "Shown in the pane." });
  expect(opened).toEqual(["napkin"]);
  expect((await ui.find({ type: "Text", text: /リポジトリ設定/ }))?.text).toBe("リポジトリ設定");
  expect((await ui.find({ key: "name" }))?.props.label).toBe("名前");
  await ui.unmount();
});

test("カタログに合わない spec は、問題点がツールの結果として返り、ペインは開かない", async ($, on) => {
  // Arrange
  const { opened } = engine(on);
  const spec = page({ x: leaf("Slider", {}) });

  // Act
  const called = await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Assert
  expect((called as { result: string }).result).toMatch(/^Invalid spec:\nelements\.x\.type/);
  expect(opened).toEqual([]);
});

test("spec を JSON 文字列で渡すと、パースしてオブジェクトと同じく描き、パースできなければその理由が返る", async ($, on) => {
  // Arrange
  const { opened } = engine(on);
  const spec = JSON.stringify(page({ h: leaf("Heading", { text: "見出し" }) }));

  // Act
  const parsed = await $.tool.call({ tool: TOOL, title: "設定", spec } as never);
  const broken = await $.tool.call({ tool: TOOL, title: "設定", spec: spec.slice(0, -1) } as never);

  // Assert
  expect((parsed as { result: string }).result).toMatch(/^Shown in the pane\./);
  expect((broken as { result: string }).result).toMatch(/^Invalid spec:\n.*JSON/);
  expect(opened).toEqual(["napkin"]);
});

test("組み込みアクションに結び付いたイベントが起きると、state が更新されて描き直される", async ($, on) => {
  // Arrange
  engine(on);
  await $.tool.call({ tool: TOOL, title: "設定", spec: FORM } as never);
  const ui = await $.ui.mount(pane());

  // Act
  await ui.input({ key: "name", text: "b" });

  // Assert
  expect((await ui.findAll({ type: "Text", text: /^[ab]$/ })).map((t) => t.text)).toEqual([
    "a",
    "b",
  ]);
  await ui.unmount();
});

test("組み込み以外のアクションに結び付いたイベントが起きると、params と state を添えたプロンプトが送られ、ペインは送信済みになる", async ($, on) => {
  // Arrange
  const { prompts } = engine(on);
  await $.tool.call({ tool: TOOL, title: "設定", spec: FORM } as never);
  const ui = await $.ui.mount(pane());
  await ui.input({ key: "name", text: "repo", kind: "change" });

  // Act
  await ui.press({ key: "create" });

  // Assert
  expect(prompts[0]).toMatch(/^\[napkin\] "設定" create\n/);
  expect(sent(prompts).state).toEqual({ name: "repo", items: ["a"] });
  expect((await ui.find({ type: "Text", text: /Sent/ }))?.text).toBe("✔ Sent to Claude.");
  await ui.unmount();
});

test("プロンプトの送信に失敗すると、ペインは送信済みにならず操作を続けられる", async ($, on) => {
  // Arrange
  mock.clock(on);
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("prompt.submit", () => {
    throw new Error("busy");
  });
  await $.tool.call({ tool: TOOL, title: "設定", spec: FORM } as never);
  const ui = await $.ui.mount(pane());

  // Act
  await ui.press({ key: "create" }).catch(() => undefined);

  // Assert
  expect(await ui.find({ type: "Text", text: /Sent/ })).toBeUndefined();
  expect(await ui.find({ key: "create" })).toBeDefined();
  await ui.unmount();
});

test("閉じた Collapsible の中の Chart は描かれず、開いたときに初めて magick で変換される", async ($, on) => {
  // Arrange
  const { converted } = engine(on);
  const spec = page({
    fold: leaf("Collapsible", { title: "詳細" }, { children: ["chart"] }),
    chart: leaf("Chart", { chart: { type: "sparkline", values: [1, 3, 2] } }),
  });
  spec.elements.page.children = ["fold"];
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);
  const ui = await $.ui.mount(pane());
  const before = converted.length;

  // Act
  await ui.press({ key: "fold/toggle" });

  // Assert
  expect(before).toBe(0);
  expect(converted).toHaveLength(1);
  await ui.unmount();
});

test("max が state から 0 になった Progress は、value が max に達しているので 100% と描く", async ($, on) => {
  // Arrange
  engine(on);
  const spec = page({ p: leaf("Progress", { value: 0, max: { $state: "/total" } }) }, { total: 0 });
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Act
  const ui = await $.ui.mount(pane());

  // Assert
  expect((await ui.find({ type: "Text", text: /%$/ }))?.text).toBe("100%");
  await ui.unmount();
});

test("repeat の key がある行の入力欄は、行を消しても項目の key で区別され、残った行が消えた行の欄を引き継がない", async ($, on) => {
  // Arrange
  engine(on);
  const spec = page(
    {
      rows: leaf(
        "Stack",
        {},
        { repeat: { statePath: "/items", key: "id" }, children: ["name", "drop"] },
      ),
      name: leaf("Input", { label: "名前" }),
      drop: leaf(
        "Button",
        { label: "消す" },
        {
          on: {
            press: {
              action: "removeState",
              params: { statePath: "/items", index: { $index: true } },
            },
          },
        },
      ),
    },
    { items: [{ id: "a" }, { id: "b" }] },
  );
  spec.elements.page.children = ["rows"];
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);
  const ui = await $.ui.mount(pane());
  const before = (await ui.findAll({ type: "Input" })).map((i) => i.key);

  // Act
  await ui.press({ key: "drop@/a" });

  // Assert
  expect(before).toEqual(["name@/a", "name@/b"]);
  expect((await ui.findAll({ type: "Input" })).map((i) => i.key)).toEqual(["name@/b"]);
  await ui.unmount();
});

test("入力欄で Enter を押すと、欄が作り直され、入力した値が表示されたまま残る", async ($, on) => {
  // Arrange
  engine(on);
  await $.tool.call({ tool: TOOL, title: "設定", spec: FORM } as never);
  const ui = await $.ui.mount(pane());

  // Act
  await ui.input({ key: "name", text: "b" });

  // Assert
  expect(await ui.find({ key: "name" })).toBeUndefined();
  expect((await ui.find({ key: "name#1" }))?.props.value).toBe("b");
  await ui.unmount();
});

const EVERY = page(
  {
    card: { type: "Card", props: { title: "カード", description: "説明" }, children: ["fold"] },
    fold: { type: "Collapsible", props: { title: "詳細", defaultOpen: true }, children: ["md"] },
    md: leaf("Markdown", { text: "**太字**" }),
    tabs: {
      type: "Tabs",
      props: { tabs: [{ label: "A", value: "a" }], value: { $bindState: "/tab" } },
      children: ["text"],
    },
    text: leaf("Text", { text: "本文", variant: "muted" }),
    sep: leaf("Separator", { label: "区切り" }),
    heading: leaf("Heading", { text: "見出し", level: "h1" }),
    code: leaf("Code", { code: "@@ -1 +1 @@\n-a\n+b", format: "diff" }),
    link: leaf("Link", { label: "docs", href: "https://json-render.dev" }),
    badge: leaf("Badge", { text: "LIVE", variant: "destructive" }),
    alert: leaf("Alert", { title: "注意", message: "内容", type: "warning" }),
    table: leaf("Table", { columns: ["名前"], rows: [["東京"]], caption: "表" }),
    chart: leaf("Chart", {
      title: "p95",
      chart: { type: "bar", categories: ["月", "火"], series: [{ name: "ms", values: [120, 80] }] },
    }),
    progress: leaf("Progress", { value: 40, label: "進捗" }),
    spinner: leaf("Spinner", { label: "待機" }),
    image: leaf("Image", {
      src: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="32"><rect width="80" height="32"/></svg>',
      alt: "四角",
    }),
    mermaid: leaf("Mermaid", {
      source: 'flowchart LR\n  branch --> review["url() と @import を確認"] --> merge',
    }),
    button: leaf("Button", { label: "送信", variant: "primary" }),
    input: leaf("Input", { label: "名前", value: { $bindState: "/name" } }),
    select: leaf("Select", {
      label: "公開範囲",
      options: ["public", "private"],
      value: { $bindState: "/v" },
    }),
    check: leaf("Checkbox", { label: "CI", checked: { $bindState: "/ci" } }),
  },
  { tab: "a", name: "", v: "private", ci: true },
);

test("標準カタログの 22 部品をすべて使った spec を、4 つの surface のどれでも描ける", async ($, on) => {
  // Arrange
  engine(on);
  const types = new Set(Object.values(EVERY.elements).map((el) => el.type));
  const called = await $.tool.call({ tool: TOOL, title: "全部品", spec: EVERY } as never);

  // Act
  const drawn = [];
  for (const surface of ["terminal", "desktop", "vscode", "mobile"] as const) {
    const ui = await $.ui.mount(pane(surface));
    drawn.push(await ui.drawn());
    await ui.unmount();
  }

  // Assert
  expect(types.size).toBe(22);
  expect(called).toMatchObject({ result: "Shown in the pane." });
  expect(drawn).toHaveLength(4);
});

test("ターミナルでは、Chart の SVG を magick で PNG にして Image で描き、alt に文字のグラフを入れる", async ($, on) => {
  // Arrange
  const { converted } = engine(on);
  const spec = page({
    chart: leaf("Chart", {
      title: "週次",
      chart: { type: "bar", categories: ["月", "火"], series: [{ name: "ms", values: [120, 80] }] },
    }),
  });
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Act
  const ui = await $.ui.mount(pane());

  // Assert
  const image = (await ui.find({ type: "Image" }))!;
  expect(converted).toHaveLength(1);
  expect(converted[0]).toMatch(/^<svg /);
  expect(image.props.source).toEqual({ png: PNG });
  expect(image.props.alt).toMatch(/^週次\n月 █+ 120\n/);
  await ui.unmount();
});

test("ターミナルで、var() の値を展開すると外を参照する SVG の Image は、展開されずにそのまま magick に渡る", async ($, on) => {
  // Arrange
  const { converted } = engine(on);
  const src =
    '<svg xmlns="http://www.w3.org/2000/svg"><style>svg{--q:"}</style><image x="var(--q) href=var(--q)http://example.invalid/x"/></svg>';
  const spec = page({
    image: leaf("Image", {
      src,
      alt: "図",
    }),
  });
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Act
  const ui = await $.ui.mount(pane());

  // Assert
  expect(converted).toEqual([src]);
  await ui.unmount();
});

test("ターミナルでは、ラベルに url( や @import を含む Mermaid も、var() を展開した SVG から magick で PNG にして Image で描き、alt に source を入れる", async ($, on) => {
  // Arrange
  const { converted } = engine(on);
  const spec = page({ mermaid: EVERY.elements.mermaid });
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Act
  const ui = await $.ui.mount(pane());

  // Assert
  const image = (await ui.find({ type: "Image" }))!;
  expect(converted).toHaveLength(1);
  expect(converted[0]).toMatch(/^<svg [^]*>branch</);
  expect(converted[0]).not.toContain("var(");
  expect(image.props.source).toEqual({ png: PNG });
  expect(image.props.alt).toBe(EVERY.elements.mermaid.props.source);
  await ui.unmount();
});

test("mermaid として読めない source の Mermaid は、読めない理由を要素のエラーとして描く", async ($, on) => {
  // Arrange
  const { converted } = engine(on);
  const spec = page({ mermaid: leaf("Mermaid", { source: "flowchart LR\n  branch -->" }) });
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Act
  const ui = await $.ui.mount(pane());

  // Assert
  const error = await ui.find({ type: "Text", text: /^mermaid \(Mermaid\): Parse error/ });
  expect(error?.props.color).toBe("red");
  expect(converted).toEqual([]);
  await ui.unmount();
});

test("ターミナルで、外の URL の画像を置く Mermaid は、magick に渡さず、その URL を示すエラーを描く", async ($, on) => {
  // Arrange
  const { converted } = engine(on);
  const source = 'flowchart LR\n  A@{ img: "http://example.invalid/x.png", label: "a" } --> B';
  const spec = page({ mermaid: leaf("Mermaid", { source }) });
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Act
  const ui = await $.ui.mount(pane());

  // Assert
  const error = await ui.find({ type: "Text", text: /^mermaid \(Mermaid\): / });
  expect(error?.text).toBe(
    "mermaid (Mermaid): the SVG refers to an image outside itself: http://example.invalid/x.png",
  );
  expect(error?.props.color).toBe("red");
  expect(converted).toEqual([]);
  await ui.unmount();
});

test("desktop では、Chart と Image と Mermaid を Svg 要素で描く", async ($, on) => {
  // Arrange
  const { converted } = engine(on);
  const spec = page({
    chart: EVERY.elements.chart,
    image: EVERY.elements.image,
    mermaid: EVERY.elements.mermaid,
  });
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Act
  const ui = await $.ui.mount(pane("desktop"));

  // Assert
  const svgs = await ui.findAll({ type: "Svg" });
  expect(svgs.map((s) => s.props.alt)).toEqual([
    expect.stringMatching(/^p95\n/),
    "四角",
    EVERY.elements.mermaid.props.source,
  ]);
  expect(converted).toEqual([]);
  await ui.unmount();
});

test("mobile では、Select を選択肢のボタンで描き、Input の下に入力欄が出ないときの案内を添える", async ($, on) => {
  // Arrange
  engine(on);
  const spec = page(
    { select: EVERY.elements.select, input: EVERY.elements.input },
    { v: "private", name: "" },
  );
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);
  const ui = await $.ui.mount(pane("mobile"));

  // Act
  await ui.press({ key: "select/public" });

  // Assert
  expect((await ui.find({ key: "select/public" }))?.props.label).toBe("● public");
  expect(await ui.find({ type: "Text", text: /If no field shows here/ })).toBeDefined();
  await ui.unmount();
});

test("watch したパスの値が変わると、結び付いたアクションが順に動く", async ($, on) => {
  // Arrange
  const { prompts } = engine(on);
  const spec = page(
    {
      country: leaf(
        "Select",
        { options: ["JP", "US"], value: { $bindState: "/country" } },
        {
          watch: {
            "/country": [
              { action: "setState", params: { statePath: "/city", value: "" } },
              { action: "loadCities", params: { country: { $state: "/country" } } },
            ],
          },
        },
      ),
    },
    { country: "JP", city: "Tokyo" },
  );
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);
  const ui = await $.ui.mount(pane());

  // Act
  await ui.select({ key: "country", value: "US" });

  // Assert
  expect(sent(prompts)).toEqual({
    params: { country: "US" },
    state: { country: "US", city: "" },
  });
  await ui.unmount();
});

test("confirm 付きのアクションは確認ダイアログを出し、N で取り消すと送らず、Y で確定すると送る", async ($, on) => {
  // Arrange
  const { prompts } = engine(on);
  const confirm = { title: "削除", message: "${/name} を消します", variant: "danger" };
  const spec = page(
    { del: leaf("Button", { label: "削除" }, { on: { press: { action: "remove", confirm } } }) },
    { name: "repo" },
  );
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);
  const ui = await $.ui.mount(pane());

  // Act
  await ui.press({ key: "del" });
  const message = (await ui.find({ type: "Text", text: /消します/ }))?.text;
  await ui.press({ key: "confirm/no" });
  const afterCancel = [...prompts];
  await ui.press({ key: "del" });
  await ui.press({ key: "confirm/yes" });

  // Assert
  expect(message).toBe("repo を消します");
  expect(afterCancel).toEqual([]);
  expect(prompts).toHaveLength(1);
  await ui.unmount();
});

test("Checkbox と Collapsible は押すたびに切り替わる", async ($, on) => {
  // Arrange
  engine(on);
  const spec = page(
    {
      ci: leaf("Checkbox", { label: "CI", checked: { $bindState: "/ci" } }),
      more: { type: "Collapsible", props: { title: "詳細" }, children: ["body"] },
    },
    { ci: false },
  );
  const withBody = {
    ...spec,
    elements: { ...spec.elements, body: leaf("Text", { text: "本文" }) },
  };
  await $.tool.call({ tool: TOOL, title: "設定", spec: withBody } as never);
  const ui = await $.ui.mount(pane());
  const closed = await ui.find({ type: "Text", text: /本文/ });

  // Act
  await ui.press({ key: "ci" });
  await ui.press({ key: "more/toggle" });

  // Assert
  expect(closed).toBeUndefined();
  expect((await ui.find({ key: "ci" }))?.props.label).toBe("[x] CI");
  expect((await ui.find({ type: "Text", text: /本文/ }))?.text).toBe("本文");
  await ui.unmount();
});

test("Spinner は 10 コマを 80 ミリ秒ごとに進める", async ($, on) => {
  // Arrange
  const { clock } = engine(on);
  await $.tool.call({
    tool: TOOL,
    title: "設定",
    spec: page({ s: leaf("Spinner", { label: "待機" }) }),
  } as never);
  const ui = await $.ui.mount(pane());
  const frame = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/;
  const first = (await ui.find({ type: "Text", text: frame }))?.text;

  // Act
  await clock.advance(80);

  // Assert
  expect(first).toBe("⠋");
  expect((await ui.find({ type: "Text", text: frame }))?.text).toBe("⠙");
  await ui.unmount();
});

test("Table は、短い列を内容の幅のまま残し、長い列を縮めてセルの中で折り返す箱で描く", async ($, on) => {
  // Arrange
  engine(on);
  const long = "長い説明が入るセルで、ペインの幅に収まらないので折り返す必要がある";
  const spec = page({
    table: leaf("Table", { columns: ["ファイル", "責務"], rows: [["src/draw.tsx", long]] }),
  });
  await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Act
  const ui = await $.ui.mount(pane());

  // Assert
  const holding = async (text: RegExp) =>
    (await ui.findAll({ type: "Box" }))
      .filter((box) => box.children.some((c) => text.test(JSON.stringify(c))))
      .at(-1)?.props;
  expect(await holding(/"src\/draw\.tsx"/)).toEqual({ width: 12, minWidth: 12, flexShrink: 12 });
  expect(await holding(new RegExp(long))).toEqual({ width: 66, minWidth: 20, flexShrink: 66 });
  await ui.unmount();
});

test("ツール行は、畳まれている間は title だけを示し、ペインに描けたときは下に要約だけが出る", async ($, on) => {
  // Arrange
  engine(on);
  on("ui.render", ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>{JSON.stringify((e.props as { input?: unknown }).input ?? null)}</Text>;
  });
  await $.tool.call({ tool: TOOL, tool_use_id: "call-1", title: "設定", spec: FORM } as never);
  const row = (component: "ToolUse" | "ToolResult", props: Record<string, unknown>) =>
    ({
      plugin: "napkin",
      component,
      requestId: "call-1",
      surface: "terminal",
      viewport: { columns: 100, rows: 40 },
      props: { tool_use_id: "call-1", tool: TOOL, isErrored: false, ...props },
    }) as never;

  // Act
  const use = await $.ui.mount(
    row("ToolUse", {
      input: { title: "設定", spec: FORM },
      isRunning: false,
      isInterrupted: false,
    }),
  );
  const useText = (await use.find({ type: "Text" }))?.text;
  await use.unmount();
  const result = await $.ui.mount(row("ToolResult", { output: "Shown in the pane." }));

  // Assert
  expect(useText).toBe('{"title":"設定"}');
  expect((await result.find({ type: "Text", text: /Shown/ }))?.text).toBe(
    "Shown in the pane · 6 elements (ctrl+o to expand)",
  );
  await result.unmount();
});

test("入力がまだ届いていないツール行は、input に title のキーを足さずに描かせる", async ($, on) => {
  // Arrange
  engine(on);
  on("ui.render", ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>{Object.keys((e.props as { input: object }).input).join(",")}</Text>;
  });

  // Act
  const use = await $.ui.mount({
    plugin: "napkin",
    component: "ToolUse",
    requestId: "call-1",
    surface: "terminal",
    viewport: { columns: 100, rows: 40 },
    props: {
      tool_use_id: "call-1",
      tool: TOOL,
      input: {},
      isRunning: true,
      isErrored: false,
      isInterrupted: false,
    },
  } as never);

  // Assert
  expect((await use.find({ type: "Text" }))?.text).toBe("");
  await use.unmount();
});

test("/napkin は、ペインが出ていなければ開き、出ていれば閉じる", async ($, on) => {
  // Arrange
  let isPlaced = false;
  on("ui.panes", () => ({
    value: isPlaced
      ? [
          {
            id: "napkin",
            title: "設定",
            isShown: true,
            isFocused: false,
            isPlaced: true,
            plugin: "napkin",
          },
        ]
      : [],
  }));
  on("ui.open", () => {
    isPlaced = true;
    return { value: { isPlaced: true } };
  });
  on("ui.close", () => {
    isPlaced = false;
    return { value: undefined };
  });
  const run = () => $.command.run({ command: "napkin", args: "" } as never);

  // Act
  const shown = await run();
  const hidden = await run();

  // Assert
  expect(shown).toMatchObject({ text: "pane shown" });
  expect(hidden).toMatchObject({ text: "pane hidden" });
});

test("警告のある spec は、描いたうえで警告をツールの結果に 1 行ずつ添える", async ($, on) => {
  // Arrange
  engine(on);
  const spec = page({ t: leaf("Text", { text: { $computed: "upper", args: {} } }) });

  // Act
  const called = await $.tool.call({ tool: TOOL, title: "設定", spec } as never);

  // Assert
  expect((called as { result: string }).result).toMatch(
    /^Shown in the pane\.\nWarning: elements\.t: /,
  );
});
