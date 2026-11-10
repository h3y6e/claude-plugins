import { eastAsianWidth } from "get-east-asian-width";

export const cells = (text: string) =>
  Array.from(text).reduce((n, ch) => n + eastAsianWidth(ch.codePointAt(0)!), 0);

const PALETTE = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948"];
const INK = "#8a8a8a";
const BLOCKS = "▁▂▃▄▅▆▇█";

type Series = { name: string; values: number[] };
export type ChartProps =
  | { type: "bar" | "line"; categories: string[]; series: Series[] }
  | { type: "sparkline"; values: number[] };

export type Picture = { svg: string; width: number; height: number; alt: string };

const escape = (text: string) =>
  text.replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]!);

const svg = (width: number, height: number, body: string[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif" font-size="12">${body.join("")}</svg>`;

const label = (x: number, y: number, text: string, anchor = "middle") =>
  `<text x="${x}" y="${y}" fill="${INK}" text-anchor="${anchor}">${escape(text)}</text>`;

const spark = (values: number[]) => {
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  return values.map((v) => BLOCKS[Math.round(((v - min) / range) * 7)]).join("");
};

const bars = (categories: string[], series: Series[]) => {
  const width = Math.max(...categories.map(cells));
  const max = Math.max(...series.flatMap((s) => s.values.map(Math.abs)), 1);
  return categories
    .map((c, i) =>
      series
        .map(
          (s, j) =>
            `${j === 0 ? c + " ".repeat(width - cells(c)) : " ".repeat(width)} ${"█".repeat(Math.round((Math.abs(s.values[i]!) / max) * 20))} ${s.values[i]}${series.length > 1 ? ` ${s.name}` : ""}`,
        )
        .join("\n"),
    )
    .join("\n");
};

export const drawChart = (title: string | null | undefined, chart: ChartProps): Picture => {
  const heading = title ? [label(8, 16, title, "start")] : [];
  const top = title ? 28 : 8;
  if (chart.type === "sparkline") {
    const [width, height] = [240, top + 40];
    const min = Math.min(...chart.values);
    const range = Math.max(...chart.values) - min || 1;
    const points = chart.values
      .map(
        (v, i) =>
          `${8 + (i / Math.max(1, chart.values.length - 1)) * (width - 16)},${top + 36 - ((v - min) / range) * 32}`,
      )
      .join(" ");
    return {
      svg: svg(width, height, [
        ...heading,
        `<polyline points="${points}" fill="none" stroke="${PALETTE[0]}" stroke-width="2"/>`,
      ]),
      width,
      height,
      alt: `${title ? `${title} ` : ""}${spark(chart.values)}`,
    };
  }
  const { categories, series } = chart;
  const [width, height] = [480, top + 200];
  const [left, right, bottom] = [40, 472, top + 170];
  const values = series.flatMap((s) => s.values);
  const [min, max] = [Math.min(...values, 0), Math.max(...values, 1)];
  const y = (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top - 8);
  const step = (right - left) / categories.length;
  const body = [
    ...heading,
    `<line x1="${left}" y1="${y(0)}" x2="${right}" y2="${y(0)}" stroke="${INK}"/>`,
    label(left - 4, y(max) + 4, String(max), "end"),
    label(left - 4, bottom + 4, String(min), "end"),
    ...categories.map((c, i) => label(left + step * (i + 0.5), bottom + 16, c)),
    ...(series.length > 1
      ? series.map((s, j) =>
          label(right - (series.length - 1 - j) * 90, top - 4, `■ ${s.name}`, "end").replace(
            INK,
            PALETTE[j % 6]!,
          ),
        )
      : []),
  ];
  if (chart.type === "bar") {
    const barWidth = (step * 0.7) / series.length;
    series.forEach((s, j) =>
      s.values.forEach((v, i) =>
        body.push(
          `<rect x="${left + step * i + step * 0.15 + barWidth * j}" y="${Math.min(y(v), y(0))}" width="${barWidth}" height="${Math.abs(y(0) - y(v))}" fill="${PALETTE[j % 6]}"/>`,
        ),
      ),
    );
  } else {
    series.forEach((s, j) =>
      body.push(
        `<polyline points="${s.values.map((v, i) => `${left + step * (i + 0.5)},${y(v)}`).join(" ")}" fill="none" stroke="${PALETTE[j % 6]}" stroke-width="2"/>`,
      ),
    );
  }
  const alt =
    chart.type === "bar"
      ? bars(categories, series)
      : series.map((s) => `${s.name} ${spark(s.values)}`).join("\n");
  return { svg: svg(width, height, body), width, height, alt: title ? `${title}\n${alt}` : alt };
};

const OUTSIDE = [
  /\b(?:xlink:)?href\s*=\s*["']\s*(?!#|data:)[^"']*/i,
  /url\(\s*["']?\s*(?!#)[^)]*/i,
  /<!ENTITY[^>]*\b(?:SYSTEM|PUBLIC)\b[^>]*/i,
  /@import[^;]*/i,
  /<!DOCTYPE[^>]*/i,
  /<\?xml-stylesheet[^>]*/i,
  /<style[^>]*>[^<]*\\[^<]*|style\s*=\s*(["'])[^"']*\\[^"']*\1/i,
];

const SVG_DOCTYPE =
  /<!DOCTYPE\s+svg\s+PUBLIC\s+(?:"-\/\/W3C\/\/DTD SVG 1\.1\/\/EN"\s+"http:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd"|"-\/\/W3C\/\/DTD SVG 20010904\/\/EN"\s+"http:\/\/www\.w3\.org\/TR\/2001\/REC-SVG-20010904\/DTD\/svg10\.dtd")\s*>/;

const decode = (url: string) => {
  const [head, body] = [url.slice(0, url.indexOf(",")), url.slice(url.indexOf(",") + 1)];
  if (!head.endsWith(";base64")) return decodeURIComponent(body);
  return new TextDecoder().decode(Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0)));
};

export const drawImage = (src: string, alt: string): Picture | { png: string; alt: string } => {
  const png = src.match(/^data:image\/png;base64,(.+)$/)?.[1];
  if (png) return { png, alt };
  const source = (src.startsWith("data:image/svg+xml") ? decode(src) : src).replace(
    SVG_DOCTYPE,
    "",
  );
  const outside = OUTSIDE.map((re) => source.match(re)?.[0]).find(Boolean);
  if (outside) throw new Error(`the SVG refers to something outside itself: ${outside}`);
  const root = source.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const size = (name: string) => Number(root.match(new RegExp(`\\s${name}="([\\d.]+)`))?.[1]);
  const box = root.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
  return {
    svg: source,
    width: size("width") || Number(box?.[1]) || 320,
    height: size("height") || Number(box?.[2]) || 160,
    alt,
  };
};
