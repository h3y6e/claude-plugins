type Space = number | "xs" | "sm" | "md" | "lg" | "xl";
type Element<P> = (props: P & { children?: JSX.Children }) => JSX.Element;

type Base = {
  Box: Element<{
    flexDirection?: "row" | "column";
    flexGrow?: number;
    flexShrink?: number;
    alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
    gap?: Space;
    position?: "absolute";
    top?: number;
    left?: number;
    bottom?: number;
    width?: number;
    height?: number;
    minWidth?: number;
    overflow?: "hidden";
    paddingX?: Space;
    paddingLeft?: Space;
    borderStyle?: string;
    borderColor?: string;
    borderDimColor?: boolean;
  }>;
  Text: Element<{
    color?: string;
    dimColor?: boolean;
    bold?: boolean;
    underline?: boolean;
    inverse?: boolean;
    mono?: boolean;
    size?: "caption" | "body" | "heading" | "title";
    weight?: "medium" | "semibold";
  }>;
  Button: Element<ButtonProps>;
  Link: Element<{ href: string; label?: string }>;
  Code: Element<{
    source: string;
    language?: string;
    format?: "source" | "diff";
    startLine?: number;
  }>;
  Markdown: Element<{ text: string }>;
};

type Input = Element<{
  key: string;
  label?: string;
  placeholder?: string;
  value?: string;
  rows?: number;
  onInput?: (value: string) => unknown;
  onSubmit: (value: string) => unknown;
}>;
type Select = Element<{
  key: string;
  label?: string;
  options: { value: string; label?: string }[];
  value?: string;
  onSelect: (value: string) => unknown;
}>;
type Image = Element<{ source: { png: string }; columns: number; rows: number; alt: string }>;
type Svg = Element<{ source: string; alt: string; width?: number; height?: number }>;

export type Ui = Base &
  (
    | { Input: Input; Select: Select; Image: Image }
    | { Input: Input; Select: Select; Svg: Svg }
    | { Svg: Svg }
  );

export type ButtonProps = {
  label?: string;
  variant?: "primary" | "secondary";
  plain?: true;
  onPress: () => unknown;
};
