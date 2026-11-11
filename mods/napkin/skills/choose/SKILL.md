---
name: choose
description: Lays out options side by side in the napkin pane and lets the person pick one with a button. Use when the person has to decide between approaches, designs, libraries or other alternatives, or asks to pick.
---

Load `mcp__napkin__json_render` with ToolSearch `select:mcp__napkin__json_render` if it is not loaded yet, then call it once with the options.

- One Card per option in a horizontal Stack: a short summary, trade-offs as Badges or Text, and a Button whose `on.press` sends a custom action such as `pick` with `params: {"option": "<name>"}`. Mark your recommendation, if any, with a Badge.
- When a free-form answer could also fit, add an Input bound with `$bindState` and a Button that sends it.
- Stop after drawing and wait. The pick comes back as the next prompt, starting with `[napkin] "<title>" pick` and followed by the params and state. Carry on with the chosen option without asking again.
