import assert from "node:assert/strict";
import { test } from "node:test";

import { applyAction, watchers } from "./actions.ts";

await test("pushState の値の $id は、一意な ID に置き換えて追加される", () => {
  // Arrange
  const state = { items: [] };

  // Act
  const next = applyAction(state, "pushState", {
    statePath: "/items",
    value: { id: "$id", n: 1 },
  });

  // Assert
  const [item] = next.items as { id: string; n: number }[];
  assert.equal(item!.n, 1);
  assert.match(item!.id, /^[0-9a-f-]{36}$/);
});

await test("watch した配列は、別のパスへの操作で複製されても発火せず、中身が変わったときだけ発火する", () => {
  // Arrange
  const binding = { action: "notify" };
  const spec = {
    root: "w",
    elements: { w: { type: "Text", props: {}, children: [], watch: { "/items": binding } } },
  };
  const before = { items: ["a"], name: "" };

  // Act
  const unrelated = watchers(
    spec,
    before,
    applyAction(before, "setState", { statePath: "/name", value: "x" }),
  );
  const pushed = watchers(
    spec,
    before,
    applyAction(before, "pushState", { statePath: "/items", value: "b" }),
  );

  // Assert
  assert.deepEqual(unrelated, []);
  assert.deepEqual(pushed, [binding]);
});
