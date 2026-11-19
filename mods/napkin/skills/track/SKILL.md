---
name: track
description: Shows the plan and progress of a multi-step task in the napkin pane, led by what the person should do now. Use when the person asks to be kept posted on progress or to watch the plan while work proceeds.
license: MIT
metadata:
  author: h3y6e
---

# Track

Load `mcp__napkin__json_render` with ToolSearch `select:mcp__napkin__json_render` if it is not loaded yet.

Numbered steps with statuses do not show the person whose turn it is. List items in four groups, in this order:

1. Your turn: what the person should do now.
2. In progress: who does what, and what follows when it finishes.
3. Waiting: what is blocked, and on what or whom.
4. Done: in a closed Collapsible.

Keep each item to one line of target, content, and who moves next, such as `PR for the parser fix: review and merge it; the release follows`. Put explanation in the chat.

Draw before starting work, and redraw the whole spec whenever work finishes, the person's turn changes, or the plan changes: each call replaces the pane. Drop finished items from the working groups, and drop a request you withdrew, such as waiting for a merge; a stale item reads as work still left.
