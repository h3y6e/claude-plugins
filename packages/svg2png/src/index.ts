type Engine = {
  process: {
    run(
      argv: string[],
      init: { stdin: string },
    ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  };
};

const inlineVars = (svg: string) => {
  const vars = Object.fromEntries(
    [...svg.matchAll(/style="([^"]*)"|<style[^>]*>([\s\S]*?)<\/style>/g)]
      .flatMap(([, attr, element]) => [...(attr ?? element)!.matchAll(/(--[\w-]+):([^;}]+)/g)])
      .map(([, k, v]) => [k, v]),
  );
  for (let prev = ""; prev !== svg;) {
    prev = svg;
    svg = svg.replace(/<style[^>]*>[\s\S]*?<\/style>|<[^>]*>/g, (markup) =>
      markup.replace(
        /var\((--[\w-]+)(?:,([^()]*))?\)/g,
        (_, k: string, fallback?: string) => vars[k] ?? fallback ?? "",
      ),
    );
  }
  return svg;
};

const convert = async ($: Engine, svg: string) => {
  const { exitCode, stdout, stderr } = await $.process.run(
    ["magick", "-density", "192", "-background", "none", "svg:-", "INLINE:PNG:-"],
    { stdin: inlineVars(svg) },
  );
  if (exitCode !== 0) throw new Error(`magick: ${stderr}`);
  return stdout.slice(stdout.indexOf(",") + 1);
};

const pngs = new Map<string, string>();

export const toPng = async ($: Engine, svg: string) => {
  if (!pngs.has(svg)) pngs.set(svg, await convert($, svg));
  return pngs.get(svg)!;
};
