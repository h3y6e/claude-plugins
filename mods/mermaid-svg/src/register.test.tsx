import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const FLOW = "```mermaid\ngraph LR\n  A --> B\n```";
const BROKEN = "```mermaid\nnot a diagram\n```";
const UUID = "[0-9a-f-]{36}";
const LINK = (url: string) => `[\u{F02E9} SVG ↗](${url})`;

const reply = (text: string) =>
  ({
    plugin: "mermaid-svg",
    component: "AssistantMessage",
    surface: "terminal",
    props: { text, isFirstOfReply: true },
  }) as const;

const engine = (on: On, env: Record<string, string>) => {
  const written: string[] = [];
  on("env.get", (_, e) => ({ value: env[e.name] }));
  on("fs.write", (_, e) => {
    if (e.text.startsWith("<svg")) written.push(e.path);
    return { value: undefined };
  });
  on("ui.render", { component: "AssistantMessage" }, ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>{e.props.text}</Text>;
  });
  return written;
};

test("when a reply holds a mermaid block pele can draw, the engine draws it with a link to its SVG below the block", async ($, on) => {
  // Arrange
  const written = engine(on, { TMPDIR: "/var/folders/T" });

  // Act
  const ui = await $.ui.mount(reply(`before\n${FLOW}\nmiddle\n${BROKEN}\nafter`));

  // Assert
  const text = (await ui.find({ type: "Text", text: /before/ }))!.text;
  expect(written).toHaveLength(1);
  expect(written[0]).toMatch(new RegExp(`^/var/folders/T/mermaid-svg/${UUID}\\.svg$`));
  expect(text).toBe(`before\n${FLOW}\n${LINK(`file://${written[0]}`)}\nmiddle\n${BROKEN}\nafter`);
  await ui.unmount();
});

test("when TMPDIR is unset, as on Linux, the SVG goes under /tmp", async ($, on) => {
  // Arrange
  const written = engine(on, {});

  // Act
  const ui = await $.ui.mount(reply(FLOW));

  // Assert
  const text = (await ui.find({ type: "Text", text: /mermaid/ }))!.text;
  expect(written[0]).toMatch(new RegExp(`^/tmp/mermaid-svg/${UUID}\\.svg$`));
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
  expect(text).toMatch(new RegExp(`\\(file:///C:/Users/me/Temp/mermaid-svg/${UUID}\\.svg\\)$`));
  await ui.unmount();
});

test("when no mermaid block in a reply is readable, the reply is left to the engine as written", async ($, on) => {
  // Arrange
  const written = engine(on, { TMPDIR: "/tmp" });

  // Act
  const ui = await $.ui.mount(reply(BROKEN));

  // Assert
  expect(written).toEqual([]);
  expect((await ui.find({ type: "Text", text: /not a diagram/ }))?.text).toBe(BROKEN);
  await ui.unmount();
});
