# claude-plugins

[Claude Code plugins](https://code.claude.com/docs/en/plugins/overview) for my own use.

| Plugin                          | What it does                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [mermaid-svg](mods/mermaid-svg) | Writes each mermaid block in Claude's replies to an SVG file with [pele](https://pele.run) and links the file below the block; the reply itself still shows the source |

## Install

```sh
claude plugin marketplace add h3y6e/claude-plugins
claude plugin install mermaid-svg@h3y6e
```

## Develop

```sh
aube install
aubr build
claude --plugin-dir mods/mermaid-svg
aubr lint
mise run test
mise run validate
```

Each mod's `hooks/register.mjs` is bundled from `src/` by `aubr build` and committed, since a marketplace install runs the repository as is.
It is minified without mangling: Claude Code reads `$`, `on` and `next` by name and refuses a module that renames them.
`aubr lint` type-checks against the mods API types that Claude Code writes to `.claude-plugin/types/` when it loads a mod with `--plugin-dir`; with `CI` set it skips the type check, as CI has no such types.
