import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const FLOW = "```mermaid\ngraph LR\n  A --> B\n```";
const BROKEN = "```mermaid\nnot a diagram\n```";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==";
const HASH = "[0-9a-f]{40}";
const LINK = (url: string) => `[\u{F02E9} SVG ↗](${url})`;

const reply = (text: string, surface: "terminal" | "desktop" = "desktop") =>
  ({
    plugin: "mermaid-svg",
    component: "AssistantMessage",
    surface,
    props: { text, isFirstOfReply: true },
  }) as const;

const engine = (on: On, env: Record<string, string>) => {
  const written: string[] = [];
  const converted: string[] = [];
  on("env.get", (_, e) => ({ value: env[e.name] }));
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
  on("fs.write", (_, e) => {
    if (e.text.startsWith("<svg")) written.push(e.path);
    return { value: undefined };
  });
  on("ui.render", { component: "AssistantMessage" }, ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>{e.props.text}</Text>;
  });
  return { written, converted };
};

test("outside the terminal, when a reply holds a mermaid block pele can draw, the engine draws it with a link to its SVG below the block", async ($, on) => {
  // Arrange
  const { written } = engine(on, { TMPDIR: "/var/folders/T/" });

  // Act
  const ui = await $.ui.mount(reply(`before\n${FLOW}\nmiddle\n${BROKEN}\nafter`));

  // Assert
  const text = (await ui.find({ type: "Text", text: /before/ }))!.text;
  expect(written).toHaveLength(1);
  expect(written[0]).toMatch(new RegExp(`^/var/folders/T/mermaid-svg/${HASH}\\.svg$`));
  expect(text).toBe(`before\n${FLOW}\n${LINK(`file://${written[0]}`)}\nmiddle\n${BROKEN}\nafter`);
  await ui.unmount();
});

test("when TMPDIR is unset, as on Linux, the SVG goes under /tmp", async ($, on) => {
  // Arrange
  const { written } = engine(on, {});

  // Act
  const ui = await $.ui.mount(reply(FLOW));

  // Assert
  const text = (await ui.find({ type: "Text", text: /mermaid/ }))!.text;
  expect(written[0]).toMatch(new RegExp(`^/tmp/mermaid-svg/${HASH}\\.svg$`));
  expect(text).toBe(`${FLOW}\n${LINK(`file://${written[0]}`)}`);
  await ui.unmount();
});

test("when only TEMP is set, as on Windows, the link is a file URL with its drive", async ($, on) => {
  // Arrange
  engine(on, { TEMP: "C:\\Users\\me\\Temp" });

  // Act
  const ui = await $.ui.mount(reply(FLOW));

  // Assert
  const text = (await ui.find({ type: "Text", text: /mermaid/ }))!.text;
  expect(text).toMatch(new RegExp(`\\(file:///C:/Users/me/Temp/mermaid-svg/${HASH}\\.svg\\)$`));
  await ui.unmount();
});

test("when no mermaid block in a reply is readable, the reply is left to the engine as written", async ($, on) => {
  // Arrange
  const { written } = engine(on, { TMPDIR: "/tmp" });

  // Act
  const ui = await $.ui.mount(reply(BROKEN));

  // Assert
  expect(written).toEqual([]);
  expect((await ui.find({ type: "Text", text: /not a diagram/ }))?.text).toBe(BROKEN);
  await ui.unmount();
});

test("on the terminal, each mermaid block pele can draw is drawn as a PNG over its source with a link to its SVG below", async ($, on) => {
  // Arrange
  const { written, converted } = engine(on, { TMPDIR: "/tmp" });

  // Act
  const ui = await $.ui.mount({
    ...reply(`before\n${FLOW}\nafter`, "terminal"),
    viewport: { columns: 80, rows: 24 },
  });

  // Assert
  const image = (await ui.find({ type: "Image" }))!;
  expect(image.props.source).toEqual({ png: PNG });
  expect(image.props.alt).toBe(FLOW);
  expect(converted).toHaveLength(1);
  expect(converted[0]).not.toContain("var(");
  expect((await ui.find({ type: "Text", text: /before/ }))?.text).toBe("before");
  expect((await ui.find({ type: "Markdown", text: /SVG/ }))?.text).toBe(
    LINK(`file://${written[0]}`),
  );
  expect((await ui.find({ type: "Markdown", text: /after/ }))?.text).toBe("after");
  await ui.unmount();
});
