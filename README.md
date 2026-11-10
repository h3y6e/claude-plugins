# claude-plugins

[Claude Code プラグイン](https://code.claude.com/docs/ja/plugins/overview)

| プラグイン                    | 内容                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| [mermaid](mods/mermaid)       | 返信の mermaid ブロックに pele で描いた SVG へのリンクを付ける                 |
| [dubbed](mods/dubbed)         | 返信や recap を日本語か英語に訳して表示し、原文はその下に折りたたむ            |
| [whiteboard](mods/whiteboard) | Claude が書いた json-render の spec をペインに描き、操作の結果を Claude に返す |

```sh
claude plugin marketplace add h3y6e/claude-plugins
claude plugin install mermaid@h3y6e
claude plugin install dubbed@h3y6e
claude plugin install whiteboard@h3y6e
```

## Development

```sh
mise install
aube install
aubr build
aubr lint
mise run test
mise run validate
```
