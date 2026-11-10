import { defineSchema } from "@json-render/core";
import type { z } from "zod";

type Components = Record<string, { props: z.ZodType; description: string; events?: string[] }>;

export const schema = defineSchema(
  (s) => ({
    spec: s.object({
      root: s.string(),
      elements: s.record(
        s.object({
          type: s.ref("catalog.components"),
          props: s.propsOf("catalog.components"),
          children: s.array(s.string()),
          visible: { ...s.any(), ...s.optional() },
          repeat: { ...s.any(), ...s.optional() },
          on: { ...s.any(), ...s.optional() },
          watch: { ...s.any(), ...s.optional() },
        }),
      ),
      state: { ...s.any(), ...s.optional() },
    }),
    catalog: s.object({
      components: s.map({
        props: s.zod(),
        slots: s.array(s.string()),
        description: s.string(),
      }),
    }),
  }),
  {
    builtInActions: [
      { name: "setState", description: "Set the value at params.statePath to params.value." },
      {
        name: "pushState",
        description:
          'Append params.value to the array at params.statePath; "$id" in the value becomes a unique id.',
      },
      {
        name: "removeState",
        description: "Remove params.index from the array at params.statePath.",
      },
    ],
    promptTemplate: ({ catalog, formatZodType }) =>
      Object.entries((catalog as { components: Components }).components)
        .map(
          ([name, c]) =>
            `${name} ${formatZodType(c.props)}${c.events ? ` on:${c.events.join("|")}` : ""}: ${c.description}`,
        )
        .join("\n"),
  },
);
