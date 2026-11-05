# claude-plugins

My [Claude Code plugins](https://code.claude.com/docs/en/plugins/overview).

| Plugin                  | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| [mermaid](mods/mermaid) | Links mermaid blocks in replies to an SVG by pele                    |
| [dubbed](mods/dubbed)   | Shows replies dubbed into Japanese or English, original folded below |

```sh
claude plugin marketplace add h3y6e/claude-plugins
claude plugin install mermaid@h3y6e
claude plugin install dubbed@h3y6e
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
