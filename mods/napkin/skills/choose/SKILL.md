---
name: choose
description: Lays out alternatives in the napkin pane so the person picks one with a button. Use when the person asks to pick, or when a decision between approaches, designs, or libraries is theirs to make.
license: MIT
metadata:
  author: h3y6e
---

# Choose

Load `mcp__napkin__json_render` with ToolSearch `select:mcp__napkin__json_render` if it is not loaded yet.

Give each option a Button whose `on.press` sends a custom action, such as `pick` with `params: {"option": "<name>"}`, then end the turn. The press comes back as the next prompt.
