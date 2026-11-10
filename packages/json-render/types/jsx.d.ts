declare const h: (
  tag: (props: never) => JSX.Element,
  props: object | null,
  ...children: unknown[]
) => JSX.Element;

declare namespace JSX {
  type Element = { readonly type: string };
  type Children = Element | string | number | boolean | null | undefined | readonly Children[];
  type ElementType = (props: never) => Element;
  interface IntrinsicElements {}
  interface ElementChildrenAttribute {
    children: unknown;
  }
  interface IntrinsicAttributes {
    key?: string;
  }
}
