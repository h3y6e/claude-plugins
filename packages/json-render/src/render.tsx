import {
  evaluateVisibility,
  getByPath,
  resolveBindings,
  resolveElementProps,
  resolveRepeatItemStatePath,
  resolveRepeatStatePath,
} from "@json-render/core";
import type { ActionBinding, Spec, StateModel } from "@json-render/core";

import { cells, drawChart, drawImage } from "./chart";
import type { ChartProps, Picture } from "./chart";
import type { ButtonProps, Ui } from "./ui";

type Element = Spec["elements"][string];
export type Scope = { repeatItem?: unknown; repeatIndex?: number; repeatBasePath?: string };

export type Act = {
  submits: Record<string, number>;
  open: Record<string, boolean>;
  set: (statePath: string, value: unknown) => Promise<unknown>;
  submitted: (key: string) => Promise<unknown>;
  toggle: (key: string) => Promise<unknown>;
  fire: (bindings: ActionBinding | ActionBinding[], scope: Scope) => Promise<unknown>;
};

export type RenderOptions = {
  ui: Ui;
  surface: string;
  spec: Spec;
  state: StateModel;
  cols: number;
  frame: number;
  pngs?: Map<string, string | undefined>;
  wanted?: string[];
  spinners?: string[];
  act?: Act;
};

const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const SHORT = 20;
const INPUTS = new Set(["Input", "Select", "Checkbox"]);
const TONE: Record<string, string> = {
  info: "blue",
  success: "green",
  warning: "yellow",
  error: "red",
};

const defined = (props: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined));

export const render = (o: RenderOptions): JSX.Element => (
  <o.ui.Box flexDirection="column">{drawElement(o, o.spec.root, {})}</o.ui.Box>
);

const repeated = (
  o: RenderOptions,
  statePath: Parameters<typeof resolveRepeatStatePath>[0],
  ids: string[],
  scope: Scope,
) => {
  const path = resolveRepeatStatePath(statePath, scope.repeatBasePath);
  const items = path === undefined ? undefined : getByPath(o.state, path);
  return (Array.isArray(items) ? items : []).flatMap((repeatItem, repeatIndex) => {
    const repeatBasePath = resolveRepeatItemStatePath(path!, repeatIndex);
    return ids.map((child) => drawElement(o, child, { repeatItem, repeatIndex, repeatBasePath }));
  });
};

const drawElement = (o: RenderOptions, id: string, scope: Scope): JSX.Children => {
  const el = o.spec.elements[id];
  if (!el) return null;
  const ctx = { stateModel: o.state, ...scope };
  if (el.visible !== undefined && !evaluateVisibility(el.visible, ctx)) return null;

  const key = scope.repeatBasePath ? `${id}@${scope.repeatBasePath}` : id;
  const ids = el.children ?? [];
  const children = el.repeat
    ? repeated(o, el.repeat.statePath, ids, scope)
    : isColumn(el)
      ? labelled(o, ids, scope)
      : ids.map((child) => drawElement(o, child, scope));
  const on = el.on ?? {};
  const fire = async (event: string) => {
    if (on[event]) await o.act?.fire(on[event], scope);
  };

  try {
    return drawComponent(o, {
      type: el.type,
      key,
      p: defined(resolveElementProps(el.props, ctx)),
      bind: resolveBindings(el.props, ctx) ?? {},
      children,
      fire,
    });
  } catch (error) {
    return <o.ui.Text color="red">{`${id} (${el.type}): ${(error as Error).message}`}</o.ui.Text>;
  }
};

const isColumn = (el: Element) =>
  el.type === "Card" ||
  el.type === "Collapsible" ||
  (el.type === "Stack" && el.props.direction !== "horizontal");

const isLabel = (o: RenderOptions, id: string, next: string | undefined) =>
  o.spec.elements[id]?.type === "Text" && INPUTS.has(o.spec.elements[next ?? ""]?.type ?? "");

const labelled = (o: RenderOptions, ids: string[], scope: Scope) => {
  const drawn: JSX.Children[] = [];
  for (let i = 0; i < ids.length; i++) {
    const [id, next] = [ids[i]!, ids[i + 1]];
    if (!isLabel(o, id, next)) {
      drawn.push(drawElement(o, id, scope));
      continue;
    }
    drawn.push(
      <o.ui.Box flexDirection="column">
        {drawElement(o, id, scope)}
        {drawElement(o, next!, scope)}
      </o.ui.Box>,
    );
    i++;
  }
  return drawn;
};

const strip = (o: RenderOptions, grow: number, line: JSX.Element) => (
  <o.ui.Box flexGrow={grow} width={0} height={1} overflow="hidden">
    {line}
  </o.ui.Box>
);

const picture = (o: RenderOptions, p: Picture | { png: string; alt: string }) => {
  const { Text } = o.ui;
  if ("png" in p) {
    return "Image" in o.ui ? (
      <o.ui.Image source={{ png: p.png }} columns={Math.min(o.cols, 40)} rows={10} alt={p.alt} />
    ) : (
      <Text dimColor>{p.alt}</Text>
    );
  }
  if (o.surface !== "terminal" && "Svg" in o.ui) {
    return <o.ui.Svg source={p.svg} alt={p.alt} width={p.width} height={p.height} />;
  }
  const png = o.pngs?.get(p.svg);
  if (!png || !("Image" in o.ui)) {
    if (!o.pngs?.has(p.svg)) o.wanted?.push(p.svg);
    return <Text dimColor>{p.alt}</Text>;
  }
  const scale = Math.min(1, o.cols / (p.width / 8));
  return (
    <o.ui.Image
      source={{ png }}
      columns={Math.max(1, Math.round((p.width / 8) * scale))}
      rows={Math.max(1, Math.round((p.height / 16) * scale))}
      alt={p.alt}
    />
  );
};

const drawComponent = (
  o: RenderOptions,
  {
    type,
    key,
    p,
    bind,
    children,
    fire,
  }: {
    type: string;
    key: string;
    p: Record<string, any>;
    bind: Record<string, string>;
    children: JSX.Children[];
    fire: (event: string) => Promise<void>;
  },
): JSX.Children => {
  const { Box, Text, Link, Code, Markdown } = o.ui;
  const Button = o.act ? o.ui.Button : StillButton(o.ui);
  const change = async (value: unknown, event: string) => {
    if (bind.value ?? bind.checked) await o.act?.set((bind.value ?? bind.checked)!, value);
    await fire(event);
  };
  const isTerminal = o.surface === "terminal";

  switch (type) {
    case "Stack":
      return (
        <Box
          flexDirection={p.direction === "horizontal" ? "row" : "column"}
          gap={p.gap === "none" ? 0 : (p.gap ?? "sm")}
          alignItems={
            { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" }[
              (p.align ?? "stretch") as string
            ] as "stretch"
          }
        >
          {children}
        </Box>
      );
    case "Card":
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          {p.title && <Text bold>{p.title}</Text>}
          {p.description && <Text dimColor>{p.description}</Text>}
          {children}
        </Box>
      );
    case "Collapsible": {
      const isOpen = o.act?.open[key] ?? p.defaultOpen ?? false;
      return (
        <Box flexDirection="column">
          <Button
            key={`${key}/toggle`}
            plain
            label={`${isOpen ? "▾" : "▸"} ${p.title}`}
            onPress={() => o.act?.toggle(key)}
          />
          {isOpen && (
            <Box flexDirection="column" paddingLeft={2}>
              {children}
            </Box>
          )}
        </Box>
      );
    }
    case "Tabs": {
      const tabs: { label: string; value: string }[] = p.tabs;
      const active = p.value ?? tabs[0]?.value;
      return (
        <Box flexDirection="column">
          <Box gap={2}>
            {tabs.map((t) => (
              <Button
                key={`${key}/${t.value}`}
                plain
                variant={t.value === active ? "primary" : "secondary"}
                label={t.label}
                onPress={() => change(t.value, "change")}
              />
            ))}
          </Box>
          {isTerminal && (
            <Text color="cyan">
              {tabs
                .map((t) => (t.value === active ? "━" : " ").repeat(cells(t.label)) + "  ")
                .join("")}
            </Text>
          )}
          {children}
        </Box>
      );
    }
    case "Separator": {
      const rule = () => strip(o, 1, <Text dimColor>{"─".repeat(o.cols)}</Text>);
      return (
        <Box flexGrow={1} gap={1}>
          {rule()}
          {p.label && <Text dimColor>{p.label}</Text>}
          {p.label && rule()}
        </Box>
      );
    }
    case "Heading": {
      const level = p.level ?? "h2";
      return (
        <Text
          bold={level !== "h4"}
          underline={isTerminal && level === "h1"}
          dimColor={isTerminal && level === "h4"}
          size={level === "h1" ? "title" : level === "h2" ? "heading" : "body"}
          weight={level === "h4" ? "medium" : "semibold"}
        >
          {p.text}
        </Text>
      );
    }
    case "Text":
      return (
        <Text
          dimColor={p.variant === "muted" || p.variant === "caption"}
          size={p.variant === "caption" ? "caption" : undefined}
          mono={p.variant === "code" || undefined}
          color={p.variant === "code" && isTerminal ? "cyan" : undefined}
        >
          {p.text}
        </Text>
      );
    case "Markdown":
      return <Markdown text={p.text} />;
    case "Code":
      return (
        <Code
          source={p.code}
          language={p.language}
          format={p.format}
          startLine={p.format === "diff" ? undefined : p.startLine}
        />
      );
    case "Link":
      return <Link href={p.href} label={p.label} />;
    case "Badge": {
      const variant = p.variant ?? "default";
      if (variant === "outline") return <Text>{`[${p.text}]`}</Text>;
      return (
        <Text
          inverse
          bold
          dimColor={variant === "secondary"}
          color={variant === "destructive" ? "red" : undefined}
        >
          {` ${p.text} `}
        </Text>
      );
    }
    case "Alert": {
      const tone = TONE[p.type ?? "info"]!;
      return (
        <Box flexDirection="column" paddingLeft={2}>
          <Box position="absolute" left={0} top={0} bottom={0} width={1} overflow="hidden">
            <Text color={tone}>{"┃".repeat(500)}</Text>
          </Box>
          <Text bold color={tone}>
            {p.title}
          </Text>
          {p.message && <Text>{p.message}</Text>}
        </Box>
      );
    }
    case "Table": {
      const columns: string[] = p.columns;
      const rows: string[][] = p.rows;
      const widths = columns.map((c, i) =>
        Math.max(cells(c), ...rows.map((r) => cells(r[i] ?? ""))),
      );
      const cell = (i: number, line: JSX.Element) => (
        <Box
          width={widths[i]}
          minWidth={Math.min(widths[i]!, Math.max(SHORT, cells(columns[i]!)))}
          flexShrink={widths[i]}
        >
          {line}
        </Box>
      );
      return (
        <Box flexDirection="column">
          <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            <Box gap={2}>
              {columns.map((c, i) =>
                cell(
                  i,
                  <Text bold color="cyan">
                    {c}
                  </Text>,
                ),
              )}
            </Box>
            {rows.map((r) => (
              <Box gap={2}>{columns.map((_, i) => cell(i, <Text>{r[i] || " "}</Text>))}</Box>
            ))}
          </Box>
          {p.caption && <Text dimColor>{p.caption}</Text>}
        </Box>
      );
    }
    case "Chart":
      return picture(o, drawChart(p.title, p.chart as ChartProps));
    case "Image":
      return picture(o, drawImage(p.src, p.alt));
    case "Progress": {
      const done = Math.max(0, Math.min(1, p.value / (p.max ?? 100)));
      return (
        <Box gap={1}>
          {p.label && (
            <Box flexShrink={0}>
              <Text>{p.label}</Text>
            </Box>
          )}
          <Box width={30} flexShrink={1}>
            {strip(o, done, <Text color="green">{"█".repeat(30)}</Text>)}
            {strip(o, 1 - done, <Text dimColor>{"░".repeat(30)}</Text>)}
          </Box>
          <Box flexShrink={0}>
            <Text dimColor>{`${Math.round(done * 100)}%`}</Text>
          </Box>
        </Box>
      );
    }
    case "Spinner":
      o.spinners?.push(key);
      return (
        <Box gap={1}>
          <Text color="cyan">{FRAMES[o.frame % 10]}</Text>
          {p.label && <Text>{p.label}</Text>}
        </Box>
      );
    case "Button":
      return (
        <Button
          key={key}
          label={p.label}
          variant={p.variant ?? "secondary"}
          onPress={() => fire("press")}
        />
      );
    case "Input": {
      const shown = (
        <Text
          dimColor={!p.value}
        >{`${p.label ? `${p.label}: ` : ""}${p.value || p.placeholder || ""}`}</Text>
      );
      if (!o.act || !("Input" in o.ui)) return shown;
      return (
        <Box flexDirection="column">
          <o.ui.Input
            key={o.act.submits[key] ? `${key}#${o.act.submits[key]}` : key}
            label={p.label}
            placeholder={p.placeholder}
            value={p.value}
            rows={p.rows}
            onInput={(value) => change(value, "change")}
            onSubmit={async (value) => {
              await change(value, "submit");
              await o.act?.submitted(key);
            }}
          />
          {o.surface === "mobile" && (
            <Text dimColor>If no field shows here, answer in the terminal or desktop app.</Text>
          )}
        </Box>
      );
    }
    case "Select": {
      const options: string[] = p.options;
      if (o.act && "Select" in o.ui && o.surface !== "mobile") {
        return (
          <o.ui.Select
            key={key}
            label={p.label}
            options={options.map((value) => ({ value, label: value }))}
            value={p.value}
            onSelect={(value) => change(value, "change")}
          />
        );
      }
      return (
        <Box flexDirection="column">
          {p.label && <Text bold>{p.label}</Text>}
          {options.map((value) => (
            <Button
              key={`${key}/${value}`}
              plain
              label={`${value === p.value ? "●" : "○"} ${value}`}
              onPress={() => change(value, "change")}
            />
          ))}
        </Box>
      );
    }
    case "Checkbox":
      return (
        <Button
          key={key}
          plain
          label={`${p.checked ? "[x]" : "[ ]"} ${p.label}`}
          onPress={() => change(!p.checked, "change")}
        />
      );
  }
};

const StillButton =
  (ui: Ui) =>
  ({ label, variant, plain }: ButtonProps) => (
    <ui.Text bold={variant === "primary"} dimColor={plain === undefined && variant === "secondary"}>
      {plain ? label : `[ ${label} ]`}
    </ui.Text>
  );
