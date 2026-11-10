import assert from "node:assert/strict";
import { test } from "node:test";

import { applyAction } from "./actions.ts";

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
