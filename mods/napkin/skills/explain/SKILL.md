---
name: explain
description: Draws a diagram in the napkin pane to explain how something fits together, such as a repository, an architecture, a data or request flow, or a sequence of events. Use when the person asks to be shown how something works or is structured.
---

Load `mcp__napkin__json_render` with ToolSearch `select:mcp__napkin__json_render` if it is not loaded yet, look at what you are explaining, then call it once with a diagram.

- Draw the shape, not a list: an Image with SVG markup (boxes, labelled arrows) for structure and flows, a Chart for numbers, or nested Cards in a Stack with `↓`/`→` Text between them when SVG would be overkill. Use a Table only for attributes that are truly tabular.
- Keep labels to names the person can find in the code or docs. Put detail in Collapsibles under the diagram.
- In chat, add only what the diagram cannot say.
- If an action comes back as a `[napkin]` prompt, answer it and redraw the pane when the answer changes the picture.
