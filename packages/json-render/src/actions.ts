import { getByPath, setByPath } from "@json-render/core";
import type { ActionBinding, Spec, StateModel } from "@json-render/core";

export const BUILT_IN = new Set(["setState", "pushState", "removeState"]);

const ids = (value: unknown, depth = 0): unknown => {
  if (depth > 10) return value;
  if (value === "$id") return crypto.randomUUID();
  if (Array.isArray(value)) return value.map((v) => ids(v, depth + 1));
  if (typeof value !== "object" || value === null) return value;
  if ("$id" in value && value.$id === true) return crypto.randomUUID();
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ids(v, depth + 1)]));
};

export const applyAction = (
  state: StateModel,
  action: string,
  params: Record<string, unknown>,
): StateModel => {
  const next = structuredClone(state);
  const path = params.statePath as string | undefined;
  if (!path) return next;
  const list = getByPath(next, path);
  if (action === "setState") setByPath(next, path, params.value);
  if (action === "pushState") {
    setByPath(next, path, [...(Array.isArray(list) ? list : []), ids(params.value)]);
    if (params.clearStatePath) setByPath(next, params.clearStatePath as string, "");
  }
  if (action === "removeState" && params.index !== undefined && Array.isArray(list)) {
    setByPath(
      next,
      path,
      list.filter((_, i) => i !== params.index),
    );
  }
  return next;
};

export const watchers = (spec: Spec, before: StateModel, after: StateModel): ActionBinding[] =>
  Object.values(spec.elements).flatMap((el) =>
    Object.entries((el.watch ?? {}) as Record<string, ActionBinding | ActionBinding[]>)
      .filter(([path]) => getByPath(before, path) !== getByPath(after, path))
      .flatMap(([, bindings]) => [bindings].flat()),
  );
