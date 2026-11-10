import { getByPath, resolveElementProps, setByPath, validateSpec } from "@json-render/core";
import type { Catalog, Spec } from "@json-render/core";
import type { ZodObject } from "zod";

import { BUILT_IN } from "./actions.ts";

type Element = Spec["elements"][string];
type Issue = { isError: boolean; text: string };

const isExpression = (value: unknown) =>
  typeof value === "object" && value !== null && Object.keys(value).some((k) => k.startsWith("$"));

const uses = (value: unknown, key: string): boolean =>
  typeof value === "object" &&
  value !== null &&
  Object.entries(value).some(([k, v]) => k === key || uses(v, key));

const pointer = (path: PropertyKey[]) => `/${path.join("/")}`;

const propIssues = (catalog: Catalog, spec: Spec, id: string, el: Element) => {
  const props = (catalog.data as { components: Record<string, { props: ZodObject }> }).components[
    el.type
  ]?.props;
  if (!props || typeof el.props !== "object" || el.props === null) return [];
  const value = structuredClone(resolveElementProps(el.props, { stateModel: spec.state ?? {} }));
  const filled = new Set<string>();
  for (;;) {
    const issues = (props.safeParse(value).error?.issues ?? []).filter(
      (i) => !isExpression(el.props[String(i.path[0])]),
    );
    const missing = issues
      .map((i) => pointer(i.path))
      .filter((at) => !filled.has(at) && getByPath(value, at) === undefined);
    if (missing.length === 0) {
      return issues.map(
        (i) =>
          `elements.${id}.props.${i.path.join(".")}: ${filled.has(pointer(i.path)) ? "required" : i.message}`,
      );
    }
    for (const at of missing) {
      filled.add(at);
      setByPath(value, at, null);
    }
  }
};

const limits = (id: string, el: Element, hasFunctions: boolean): Issue[] => {
  const at = `elements.${id}`;
  const bindings = Object.values(el.on ?? {}).flat();
  return [
    ...(!hasFunctions && uses(el, "$computed")
      ? [
          {
            isError: false,
            text: `${at}: $computed resolves to undefined, no functions are registered`,
          },
        ]
      : []),
    ...(typeof el.props === "object" && el.props !== null && "checks" in el.props
      ? [{ isError: false, text: `${at}.props.checks: ignored, inputs are not validated` }]
      : []),
    ...bindings
      .filter((b) => b.confirm && BUILT_IN.has(b.action))
      .map((b) => ({
        isError: false,
        text: `${at}.on ${b.action}: confirm is not shown for built-in actions`,
      })),
    ...bindings
      .filter((b) => b.onSuccess || b.onError)
      .map((b) => ({
        isError: false,
        text: `${at}.on ${b.action}: onSuccess/onError are not run`,
      })),
  ];
};

export const check = (catalog: Catalog, spec: Spec, options: { functions?: object } = {}) => {
  const checked = catalog.validate(spec);
  const shape = checked.success
    ? []
    : checked
        .error!.issues.filter((i) => i.path[2] !== "props")
        .map((i) => `${i.path.join(".")}: ${i.message}`);
  const elements = Object.entries(spec?.elements ?? {});
  const props = elements.flatMap(([id, el]) => propIssues(catalog, spec, id, el));
  if (!checked.success) return { errors: [...shape, ...props], warnings: [] };
  const found: Issue[] = [
    ...validateSpec(spec).issues.map((i) => ({
      isError: i.severity === "error",
      text: `${i.elementKey ? `elements.${i.elementKey}: ` : ""}${i.message}`,
    })),
    ...elements.flatMap(([id, el]) => limits(id, el, Boolean(options.functions))),
  ];
  return {
    errors: [...props, ...found.filter((i) => i.isError).map((i) => i.text)],
    warnings: found.filter((i) => !i.isError).map((i) => i.text),
  };
};

export const describe = (catalog: Catalog) => catalog.prompt();
