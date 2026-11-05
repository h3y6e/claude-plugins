export type Expanded = boolean;

declare module "claude-code" {
  interface PluginState {
    dubbed: { isExpanded: StateFamily<Expanded> };
  }
}
