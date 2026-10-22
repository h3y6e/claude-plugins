import type { EngineInterface, Register } from "claude-code";
import { render } from "pele";

const FENCE = /^```mermaid[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm;

const links = new Map<string, Promise<string | undefined>>();

const link = ($: EngineInterface, source: string) => {
  if (!links.has(source)) {
    links.set(
      source,
      (async () => {
        let svg: string;
        try {
          svg = render(source).svg;
        } catch {
          return undefined;
        }
        const tmp = (await $.env.get("TMPDIR")) ?? (await $.env.get("TEMP")) ?? "/tmp";
        const path = `${tmp}/mermaid-svg/${crypto.randomUUID()}.svg`;
        await $.fs.write(path, svg);
        const url = new URL(`file:///${path.replaceAll("\\", "/").replace(/^\/+/, "")}`);
        return `[\u{F02E9} SVG ↗](${url.href})`;
      })(),
    );
  }
  return links.get(source)!;
};

export const register: Register = (on) => {
  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const found = await Promise.all([...e.props.text.matchAll(FENCE)].map(([, s]) => link($, s!)));
    if (!found.some(Boolean)) return next(e);

    const text = e.props.text.replace(FENCE, (block) => {
      const l = found.shift();
      return l ? `${block}\n${l}` : block;
    });
    return next({ ...e, props: { ...e.props, text } });
  });
};
