export type Expanded = boolean;

declare module "claude-code" {
  interface PluginState {
    "ja-subtitles": { isExpanded: StateFamily<Expanded> };
  }
}
