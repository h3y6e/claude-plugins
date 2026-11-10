import {
  BUILT_IN,
  applyAction,
  check,
  describe,
  render,
  schema,
  standardComponentDefinitions,
  watchers,
} from "@h3y6e/json-render";
import type { Act, RenderOptions } from "@h3y6e/json-render";
import { toPng } from "@h3y6e/svg2png";
import { defineCatalog, resolveAction, resolveActionParam } from "@json-render/core";
import type { Spec as CoreSpec } from "@json-render/core";
import { atom, memberOf, read, update } from "claude-code";
import type { Elements, EngineInterface, Register, RenderSurface, Timer } from "claude-code";

import type { ActionBinding, Call, Json, Spec, View } from "../types";

const PANE = "whiteboard";

const view = atom({ plugin: "whiteboard", key: "view" } as const, null, { shape: "view-5" });
const call = atom({ plugin: "whiteboard", key: "call" } as const, null);

const catalog = defineCatalog(schema, { components: standardComponentDefinitions });

let ticker: Timer | undefined;

const send = async ($: EngineInterface, action: string, params: View["state"]) => {
  const cur = (await read($, view))!;
  await $.prompt.submit({
    text: `[whiteboard] "${cur.title}" ${action}\n${JSON.stringify({ params, state: cur.state }, null, 2)}`,
  });
  await update($, view, (c) => c && { ...c, pending: null, isSent: true });
};

const commit = async (
  $: EngineInterface,
  change: (state: View["state"]) => View["state"],
  depth = 0,
): Promise<void> => {
  let before: View["state"] = {};
  const cur = (await update($, view, (c) => {
    before = c?.state ?? {};
    return c && { ...c, state: change(c.state) };
  }))!;
  if (depth > 10) return;
  const fired = watchers(cur.spec as CoreSpec, before, cur.state) as ActionBinding[];
  if (fired.length) await run($, fired, {}, depth + 1);
};

const run = async (
  $: EngineInterface,
  bindings: ActionBinding[],
  scope: object,
  depth = 0,
): Promise<void> => {
  for (const binding of bindings) {
    const cur = (await read($, view))!;
    if (cur.isSent || cur.pending) return;
    const params = Object.fromEntries(
      Object.entries(binding.params ?? {}).map(([k, p]) => [
        k,
        resolveActionParam(p, { stateModel: cur.state, ...scope }) as Json,
      ]),
    );
    if (BUILT_IN.has(binding.action)) {
      await commit($, (s) => applyAction(s, binding.action, params) as View["state"], depth);
    } else if (binding.confirm) {
      const { confirm } = resolveAction({ ...binding, params } as never, cur.state);
      await update(
        $,
        view,
        (c) => c && { ...c, pending: { action: binding.action, params, confirm: confirm! } },
      );
      return;
    } else {
      await send($, binding.action, params);
      return;
    }
  }
};

const draw = async ($: EngineInterface, options: Omit<RenderOptions, "pngs" | "wanted">) => {
  const wanted: string[] = [];
  const tree = render({ ...options, pngs: new Map(), wanted });
  if (!wanted.length) return tree;
  const pngs = await Promise.all(
    wanted.map(async (svg) => [svg, await toPng($, svg).catch(() => undefined)] as const),
  );
  return render({ ...options, pngs: new Map(pngs) });
};

const drawPane = async ($: EngineInterface, options: Omit<RenderOptions, "pngs" | "wanted">) => {
  const spinners: string[] = [];
  const tree = await draw($, { ...options, spinners });
  ticker?.cancel();
  ticker = spinners.length ? $.clock.after(80, () => $.ui.invalidate("ui.render")) : undefined;
  return tree;
};

const DESCRIPTION = `Render a json-render spec ({root, elements, state}) in a pane beside the chat. Every element needs a children array ([] for leaves). setState, pushState and removeState change the state in the pane; any other action in on or watch comes back to you, with its params and the state, as the next prompt. Components:
${describe(catalog)}`;

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "whiteboard",
      description: "Show or hide the whiteboard pane",
    });
    await $.tool.register({
      name: "json_render",
      description: DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: { title: { type: "string" }, spec: { type: "object" } },
        required: ["title", "spec"],
      },
      isDeferred: false,
    });
    return next(e);
  });

  on("tool.call", { tool: "mcp__whiteboard__json_render" }, async ($, e) => {
    const { title, spec: input } = e as unknown as { title: string; spec: Spec | string };
    let spec: Spec;
    try {
      spec = typeof input === "string" ? JSON.parse(input) : input;
    } catch (error) {
      return { result: `Invalid spec:\n${(error as SyntaxError).message}` };
    }
    const { errors, warnings } = check(catalog, spec as CoreSpec);
    if (errors.length) return { result: `Invalid spec:\n${errors.join("\n")}` };
    await update($, memberOf(call, { requestId: e.tool_use_id }), () => ({ title, spec }));
    await update($, view, () => ({
      title,
      spec,
      state: spec.state ?? {},
      submits: {},
      open: {},
      pending: null,
      isSent: false,
    }));
    const opened = await $.ui.open({ id: PANE, title });
    const shown = opened.isPlaced
      ? "Shown in the pane."
      : `Not drawn yet: ${opened.reason}. The person can open it with /whiteboard.`;
    return { result: [shown, ...warnings.map((w) => `Warning: ${w}`)].join("\n") };
  });

  on("command.run", { command: "whiteboard" }, async ($) => {
    if ((await $.ui.panes()).some((pane) => pane.id === PANE && pane.isPlaced)) {
      await $.ui.close({ id: PANE });
      return { text: "pane hidden" };
    }
    await $.ui.open({ id: PANE, title: (await read($, view))?.title ?? "whiteboard" });
    return { text: "pane shown" };
  });

  on("ui.render", { component: "ToolUse" }, async (_, e, next) => {
    if (e.props.tool !== "mcp__whiteboard__json_render" || e.props.isExpanded) return next(e);
    const { title } = e.props.input as Call;
    return next({ ...e, props: { ...e.props, input: { title } } });
  });

  on("ui.render", { component: "ToolResult" }, async ($, e, next) => {
    if (e.props.tool !== "mcp__whiteboard__json_render") return next(e);
    const shown = await read($, memberOf(call, e));
    if (!shown || e.props.isErrored) return next(e);
    const ui = $.ui.resolve(e) as Elements[RenderSurface];
    const isPlaced = String(e.props.output).startsWith("Shown in the pane.");
    const count = Object.keys(shown.spec.elements).length;
    return (
      <ui.Box flexDirection="column">
        <ui.Box>
          <ui.Text dimColor>{"  ⎿  "}</ui.Text>
          <ui.Text>
            {isPlaced ? "Shown in the pane" : "Pane not shown"} · {count} elements
            <ui.Text dimColor>
              {isPlaced
                ? e.props.isExpanded
                  ? ""
                  : " (ctrl+o to expand)"
                : " · /whiteboard to open"}
            </ui.Text>
          </ui.Text>
        </ui.Box>
        {(!isPlaced || e.props.isExpanded) && (
          <ui.Box paddingLeft={5}>
            {await draw($, {
              ui,
              surface: e.surface,
              spec: shown.spec as CoreSpec,
              state: shown.spec.state ?? {},
              cols: (e.viewport?.columns ?? 80) - 5,
              frame: 0,
            })}
          </ui.Box>
        )}
      </ui.Box>
    );
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e) as Elements[RenderSurface];
    const v = await read($, view);
    if (!v) return <ui.Text dimColor>Nothing to show.</ui.Text>;
    if (v.isSent) return <ui.Text color="green">✔ Sent to Claude.</ui.Text>;
    const base = {
      ui,
      surface: e.surface,
      spec: v.spec as CoreSpec,
      state: v.state,
      cols: e.props.bodyColumns,
      frame: Math.floor((await $.clock.now()) / 80),
    };

    if (v.pending) {
      const { action, params, confirm } = v.pending;
      return (
        <ui.Box flexDirection="column">
          {await drawPane($, base)}
          <ui.Box
            flexDirection="column"
            borderStyle="round"
            borderColor={confirm.variant === "danger" ? "red" : "blue"}
            paddingX={2}
            paddingY={1}
          >
            <ui.Text bold>{confirm.title}</ui.Text>
            <ui.Text dimColor>{confirm.message}</ui.Text>
            <ui.Box gap={2} marginTop={1}>
              <ui.Button
                key="confirm/yes"
                plain
                hotkey="y"
                label={confirm.confirmLabel ?? "Confirm"}
                onPress={() => send($, action, params)}
              />
              <ui.Button
                key="confirm/no"
                plain
                hotkey="n"
                label={confirm.cancelLabel ?? "Cancel"}
                onPress={() => update($, view, (c) => c && { ...c, pending: null })}
              />
            </ui.Box>
          </ui.Box>
        </ui.Box>
      );
    }

    const act: Act = {
      submits: v.submits,
      open: v.open,
      set: (statePath, value) =>
        commit($, (s) => applyAction(s, "setState", { statePath, value }) as View["state"]),
      submitted: (key) =>
        update(
          $,
          view,
          (c) => c && { ...c, submits: { ...c.submits, [key]: (c.submits[key] ?? 0) + 1 } },
        ),
      toggle: (key) =>
        update(
          $,
          view,
          (c) =>
            c && {
              ...c,
              open: { ...c.open, [key]: !(c.open[key] ?? isOpenByDefault(c.spec, key)) },
            },
        ),
      fire: (bindings, scope) => run($, [bindings].flat() as ActionBinding[], scope),
    };
    return drawPane($, { ...base, act });
  });
};

const isOpenByDefault = (spec: Spec, key: string) =>
  spec.elements[key.split("@")[0]!]?.props.defaultOpen === true;
