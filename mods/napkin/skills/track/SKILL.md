---
name: track
description: Keeps a live diagram of a multi-step task in the napkin pane and redraws it as each step finishes. Use when the person asks to be kept posted on progress or to watch the plan, or when a task will take many steps.
---

Load `mcp__napkin__json_render` with ToolSearch `select:mcp__napkin__json_render` if it is not loaded yet.

- Before the first step, draw the plan: a Progress for overall completion and one row per step with a Badge for its status (`done`, `doing`, `todo`, `blocked`) and a one-line note. Use the same title every time.
- After each step finishes or the plan changes, call the tool again with the whole updated spec. Add findings or blockers as Alerts.
- If an action comes back as a `[napkin]` prompt, treat it as an instruction about the task and update the pane.
