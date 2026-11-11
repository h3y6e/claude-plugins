export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Confirm = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

export type ActionBinding = {
  action: string;
  params?: { [key: string]: Json };
  confirm?: Confirm;
  onSuccess?: Json;
  onError?: Json;
  preventDefault?: boolean;
};

export type Element = {
  type: string;
  props: { [key: string]: Json };
  children?: string[];
  visible?: Json;
  repeat?: { statePath: string; key?: string };
  on?: { [event: string]: ActionBinding | ActionBinding[] };
  watch?: Json;
};

export type Spec = {
  root: string;
  elements: { [id: string]: Element };
  state?: { [key: string]: Json };
};

export type View = {
  title: string;
  spec: Spec;
  state: { [key: string]: Json };
  submits: { [key: string]: number };
  open: { [key: string]: boolean };
  pending: { action: string; params: { [key: string]: Json }; confirm: Confirm } | null;
  isSent: boolean;
};

export type Call = { title: string; spec: Spec };

declare module "claude-code" {
  interface PluginState {
    napkin: {
      view: Shaped<View | null>;
      call: StateFamily<Call | null>;
    };
  }
}
