import { inlineVars, toPng } from "@h3y6e/svg2png";
import type { EngineInterface, Register } from "claude-code";
import { render } from "pele";

const FENCE = /^(```mermaid[ \t]*\n[\s\S]*?\n```)[ \t]*$/m;

const once = <T,>(cache: Map<string, Promise<T>>, key: string, f: () => Promise<T>) => {
  if (!cache.has(key)) {
    cache.set(
      key,
      f().catch((error: unknown) => {
        cache.delete(key);
        throw error;
      }),
    );
  }
  return cache.get(key)!;
};

const draw = async ($: EngineInterface, block: string) => {
  let svg: string;
  try {
    svg = render(block.slice(block.indexOf("\n") + 1, -4)).svg;
  } catch {
    return undefined;
  }
  const tmp = (await $.env.get("TMPDIR")) ?? (await $.env.get("TEMP")) ?? "/tmp";
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(svg)));
  const path = `${tmp.replace(/[\\/]+$/, "")}/mermaid/${hash.toHex()}.svg`;
  await $.fs.write(path, svg);
  const url = new URL(`file:///${path.replaceAll("\\", "/").replace(/^\/+/, "")}`);
  const [, width, height] = svg.match(/width="([\d.]+)" height="([\d.]+)"/)!.map(Number);
  return { block, svg, width: width!, height: height!, link: `[\u{F02E9} SVG ↗](${url.href})` };
};

const diagrams = new Map<string, ReturnType<typeof draw>>();

export const register: Register = (on) => {
  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const parts = await Promise.all(
      e.props.text
        .split(FENCE)
        .map(async (p, i) => (i % 2 ? ((await once(diagrams, p, () => draw($, p))) ?? p) : p)),
    );
    if (parts.every((p) => typeof p === "string")) return next(e);

    if (e.surface !== "terminal") {
      const text = parts.map((p) => (typeof p === "string" ? p : `${p.block}\n${p.link}`)).join("");
      return next({ ...e, props: { ...e.props, text } });
    }

    const { Box, Image, Markdown } = $.ui.resolve(e);
    const room = Math.min((e.viewport?.columns ?? 80) - 2, 255);
    const [head, ...rest] = parts;
    return (
      <Box flexDirection="column">
        {await next({ ...e, props: { ...e.props, text: (head as string).trim() } })}
        <Box flexDirection="column" paddingLeft={2}>
          {await Promise.all(
            rest.map(async (p) => {
              if (typeof p === "string") return p.trim() ? <Markdown text={p.trim()} /> : null;
              const png = await toPng($, inlineVars(p.svg)).catch(() => undefined);
              if (!png) return <Markdown text={p.block} />;
              const scale = Math.min(1, room / (p.width / 8), 255 / (p.height / 16));
              const columns = Math.ceil((p.width / 8) * scale);
              const rows = Math.ceil((p.height / 16) * scale);
              return (
                <Box flexDirection="column">
                  <Image source={{ png }} columns={columns} rows={rows} alt={p.block} />
                  <Markdown text={p.link} />
                </Box>
              );
            }),
          )}
        </Box>
      </Box>
    );
  });
};
