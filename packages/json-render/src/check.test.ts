import assert from "node:assert/strict";
import { test } from "node:test";

import { defineCatalog } from "@json-render/core";
import type { Spec } from "@json-render/core";

import { standardComponentDefinitions } from "./catalog.ts";
import { check } from "./check.ts";
import { schema } from "./schema.ts";

const catalog = defineCatalog(schema, { components: standardComponentDefinitions });

const page = (elements: Record<string, Omit<Spec["elements"][string], "children">>): Spec => ({
  root: "page",
  elements: {
    page: { type: "Stack", props: {}, children: Object.keys(elements) },
    ...Object.fromEntries(
      Object.entries(elements).map(([id, el]) => [id, { ...el, children: [] }]),
    ),
  },
});

await test("カタログにない部品と props の誤りを含む spec を調べると、両方の問題点が 1 度に返る", () => {
  // Arrange
  const spec = page({
    x: { type: "Slider", props: {} },
    h: { type: "Heading", props: { content: "見出し" } },
  });

  // Act
  const { errors } = check(catalog, spec);

  // Assert
  assert.ok(errors.some((e) => e.startsWith("elements.x.type")));
  assert.ok(errors.includes("elements.h.props.text: required"));
});

await test("$computed を使う spec を関数なしで調べると、解決できないことが警告として返る", () => {
  // Arrange
  const spec = page({ t: { type: "Text", props: { text: { $computed: "upper", args: {} } } } });

  // Act
  const { errors, warnings } = check(catalog, spec);

  // Assert
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, [
    "elements.t: $computed resolves to undefined, no functions are registered",
  ]);
});
