import { atom, memberOf, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

const HISTORY = 1;
const CONTEXT = 300;
const PENDING = 8;
const FENCE = /^(`{3,}[^\n]*\n(?:[\s\S]*?\n)?`{3,})[ \t]*$/m;
const GAP = /(\s*\n\s*\n\s*|^\s+|\s+$)/;
const CODE = /`[^`\n]*`/g;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const LATIN = /\p{Script=Latin}/u;

const isExpanded = atom({ plugin: "dubbed", key: "isExpanded" } as const, false);

const paragraphs = (text: string) =>
  text.split(FENCE).flatMap((part, i) => (i % 2 ? [part] : part.split(GAP).filter(Boolean)));

const isForeign = (paragraph: string) => {
  if (paragraph.startsWith("```")) return false;
  const prose = paragraph.replace(CODE, "");
  return LATIN.test(prose) && !KANA.test(prose);
};

const foreign = (text: string) => paragraphs(text).filter(isForeign);

const finished = (streamed: string) => {
  const end = streamed.lastIndexOf("\n\n");
  if (end < 0) return "";
  const done = streamed.slice(0, end);
  const fences = [...done.matchAll(/^`{3,}/gm)];
  return fences.length % 2 ? done.slice(0, fences.at(-1)!.index) : done;
};

const pfml = (tag: string, msg: string, lang?: string) =>
  `<|plamo:tag|>${tag}${lang ? `<|plamo:key|>lang<|plamo:val|>${lang}` : ""}<|plamo:msg|>${msg}`;

let server = { endpoint: "", model: "" };
let context = "";
const history: [string, string][] = [];

const translate = async ($: EngineInterface, source: string) => {
  const prompt = [
    pfml("dataset", "translation"),
    context && pfml("context", context),
    ...history.flatMap(([s, t]) => [pfml("input", s), pfml("output", t, "ja")]),
    pfml("input", source),
    pfml("output", "", "ja"),
  ].join("");
  const res = await $.http.fetch(server.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: server.model,
      prompt,
      temperature: 0,
      stop: ["<|plamo:tag|>", "<|plamo:bos|>"],
    }),
  });
  if (!res.ok) throw new Error(`${server.endpoint}: ${res.status} ${res.text}`);
  const target = (JSON.parse(res.text) as { choices: [{ text: string }] }).choices[0].text.trim();
  if (!target) throw new Error(`${server.endpoint}: empty translation`);
  history.push([source, target]);
  history.splice(0, history.length - HISTORY);
  return target;
};

const translations = new Map<string, string>();
const pending: string[] = [];
let inFlight: string | undefined;
let isFailing = false;

const request = ($: EngineInterface, sources: string[]) => {
  for (const p of sources.toReversed()) {
    if (translations.has(p) || p === inFlight) continue;
    const i = pending.indexOf(p);
    if (i >= 0) pending.splice(i, 1);
    pending.push(p);
  }
  pending.splice(0, pending.length - PENDING);
  if (inFlight === undefined) void drain($);
};

const drain = async ($: EngineInterface) => {
  while ((inFlight = pending.pop()) !== undefined) {
    try {
      translations.set(inFlight, await translate($, inFlight));
      isFailing = false;
      $.ui.invalidate("ui.render");
    } catch (error) {
      if (!isFailing) $.ui.toast(`dubbed: ${String(error)}`);
      isFailing = true;
    }
  }
};

export const register: Register = (on, options) => {
  server = { endpoint: String(options.endpoint), model: String(options.model) };
  on("prompt.submit", (_, e, next) => {
    if (!e.isMeta && !e.command) context = e.text.slice(-CONTEXT);
    return next(e);
  });

  on("turn.step", async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e);
    const blocks = new Map<number, string>();
    for await (const chunk of next(e)) {
      if (chunk.kind === "text") {
        const streamed = (blocks.get(chunk.index) ?? "") + chunk.text;
        blocks.set(chunk.index, streamed);
        request($, foreign(finished(streamed)));
      }
      yield chunk;
    }
  });

  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const { text } = e.props;
    const sources = foreign(text);
    if (e.props.onScreen !== null) request($, sources);
    if (sources.length === 0 || !sources.every((p) => translations.has(p))) return next(e);
    const translated = paragraphs(text)
      .map((p) => translations.get(p) ?? p)
      .join("");
    const expanded = memberOf(isExpanded, e);
    const isOpen = await read($, expanded);
    const { Box, Button, Markdown, Text } = $.ui.resolve(e);
    return (
      <Box flexDirection="column">
        {await next({ ...e, props: { ...e.props, text: translated } })}
        <Box flexDirection="column" paddingLeft={2}>
          <Box gap={1}>
            <Button
              key="original"
              dimColor
              label={isOpen ? "▾ 原文" : "▸ 原文"}
              onPress={() => update($, expanded, (v) => !v)}
            />
            {!isOpen && (
              <Text dimColor italic wrap="truncate">
                {text.trim().split("\n", 1)[0]}
              </Text>
            )}
          </Box>
          {isOpen && <Markdown text={text} dimColor />}
        </Box>
      </Box>
    );
  });
};
