import { z } from "zod";

const optional = <T extends z.ZodType>(type: T) => type.nullable();

const series = z.object({ name: z.string(), values: z.array(z.number()) });

const chart = z
  .discriminatedUnion("type", [
    z.object({
      type: z.enum(["bar", "line"]),
      categories: z.array(z.string()).min(1),
      series: z.array(series).min(1),
    }),
    z.object({ type: z.literal("sparkline"), values: z.array(z.number()).min(1) }),
  ])
  .superRefine((c, ctx) => {
    if (c.type === "sparkline") return;
    c.series.forEach((s, i) => {
      if (s.values.length !== c.categories.length) {
        ctx.addIssue({
          code: "custom",
          path: ["series", i, "values"],
          message: `needs one value per category (${c.categories.length})`,
        });
      }
    });
  });

export const standardComponentDefinitions = {
  Stack: {
    props: z.object({
      direction: optional(z.enum(["horizontal", "vertical"])),
      gap: optional(z.enum(["none", "sm", "md", "lg"])),
      align: optional(z.enum(["start", "center", "end", "stretch"])),
    }),
    slots: ["default"],
    description: "Flex container, vertical by default.",
  },
  Card: {
    props: z.object({ title: optional(z.string()), description: optional(z.string()) }),
    slots: ["default"],
    description: "Bordered group with an optional title.",
  },
  Collapsible: {
    props: z.object({ title: z.string(), defaultOpen: optional(z.boolean()) }),
    slots: ["default"],
    description: "Group the person can fold and unfold.",
  },
  Tabs: {
    props: z.object({
      tabs: z.array(z.object({ label: z.string(), value: z.string() })),
      value: optional(z.string()),
    }),
    events: ["change"],
    slots: ["default"],
    description: "Tab bar; bind value with $bindState and show panels with visible on children.",
  },
  Separator: {
    props: z.object({ label: optional(z.string()) }),
    slots: [],
    description: "Horizontal rule.",
  },
  Heading: {
    props: z.object({ text: z.string(), level: optional(z.enum(["h1", "h2", "h3", "h4"])) }),
    slots: [],
    description: "Heading.",
  },
  Text: {
    props: z.object({
      text: z.string(),
      variant: optional(z.enum(["body", "muted", "caption", "code"])),
    }),
    slots: [],
    description: "Plain text.",
  },
  Markdown: {
    props: z.object({ text: z.string() }),
    slots: [],
    description: "Markdown text.",
  },
  Code: {
    props: z.object({
      code: z.string(),
      language: optional(z.string()),
      format: optional(z.enum(["source", "diff"])),
      startLine: optional(z.number().int().positive()),
    }),
    slots: [],
    description: "Highlighted code; format diff draws unified-diff hunks.",
  },
  Link: {
    props: z.object({ label: z.string(), href: z.string() }),
    slots: [],
    description: "Link.",
  },
  Badge: {
    props: z.object({
      text: z.string(),
      variant: optional(z.enum(["default", "secondary", "destructive", "outline"])),
    }),
    slots: [],
    description: "Short label.",
  },
  Alert: {
    props: z.object({
      title: z.string(),
      message: optional(z.string()),
      type: optional(z.enum(["info", "success", "warning", "error"])),
    }),
    slots: [],
    description: "Callout.",
  },
  Table: {
    props: z.object({
      columns: z.array(z.string()).min(1),
      rows: z.array(z.array(z.string())),
      caption: optional(z.string()),
    }),
    slots: [],
    description: "Table; long cells wrap.",
  },
  Chart: {
    props: z.object({ title: optional(z.string()), chart }),
    slots: [],
    description:
      "Chart. bar and line take categories and series with one value per category; sparkline takes values.",
  },
  Progress: {
    props: z.object({
      value: z.number(),
      max: optional(z.number().positive()),
      label: optional(z.string()),
    }),
    slots: [],
    description: "Progress bar.",
  },
  Spinner: {
    props: z.object({ label: optional(z.string()) }),
    slots: [],
    description: "Animated spinner.",
  },
  Image: {
    props: z.object({ src: z.string(), alt: z.string() }),
    slots: [],
    description: "Image from SVG markup or a data:image/svg+xml or data:image/png URL.",
  },
  Mermaid: {
    props: z.object({ source: z.string() }),
    slots: [],
    description:
      "Diagram from mermaid source, such as a flowchart or sequence diagram. Keep each to a few nodes with short labels; put detail in separate diagrams or a Table.",
  },
  Button: {
    props: z.object({ label: z.string(), variant: optional(z.enum(["primary", "secondary"])) }),
    events: ["press"],
    slots: [],
    description: "Button; bind on.press.",
  },
  Input: {
    props: z.object({
      label: optional(z.string()),
      placeholder: optional(z.string()),
      value: optional(z.string()),
      rows: optional(z.number().int().positive()),
    }),
    events: ["change", "submit"],
    slots: [],
    description: "Text field; bind value with $bindState. Enter submits.",
  },
  Select: {
    props: z.object({
      label: optional(z.string()),
      options: z.array(z.string()).min(1),
      value: optional(z.string()),
    }),
    events: ["change"],
    slots: [],
    description: "Choose one option; bind value with $bindState.",
  },
  Checkbox: {
    props: z.object({ label: z.string(), checked: optional(z.boolean()) }),
    events: ["change"],
    slots: [],
    description: "On/off; bind checked with $bindState.",
  },
};
