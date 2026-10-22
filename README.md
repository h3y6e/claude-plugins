# claude-plugins

My [Claude Code plugins](https://code.claude.com/docs/en/plugins/overview).

| Plugin                          | What it does                                      |
| ------------------------------- | ------------------------------------------------- |
| [mermaid-svg](mods/mermaid-svg) | Links mermaid blocks in replies to an SVG by pele |

```sh
claude plugin marketplace add h3y6e/claude-plugins
claude plugin install mermaid-svg@h3y6e
```

## Develop

```sh
mise install
aube install
aubr build
aubr lint
mise run test
mise run validate
```
