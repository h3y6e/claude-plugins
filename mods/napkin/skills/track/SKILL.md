---
name: track
description: Shows the plan and progress of a multi-step task as a live diagram in the napkin pane. Use when the person asks to be kept posted on progress or to watch the plan while work proceeds.
license: MIT
metadata:
  author: h3y6e
---

# Track

Load `mcp__napkin__json_render` with ToolSearch `select:mcp__napkin__json_render` if it is not loaded yet.

Draw the steps with their status before starting the first one. After each step finishes or the plan changes, call the tool again with the whole spec: each call replaces the pane, so a partial spec drops the other steps.
