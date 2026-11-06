# dubbed

Claude の返信や recap を日本語か英語に訳して表示し、原文はその下に折りたたみます。

![dubbed の例](assets/example.png)

## インストール

```sh
claude plugin marketplace add h3y6e/claude-plugins
claude plugin install dubbed@h3y6e
```

翻訳には [PLaMo 3 Translate](https://huggingface.co/collections/pfnet/plamo-3-translate) を使うので、[llama.cpp](https://github.com/ggml-org/llama.cpp) などで OpenAI 互換の completions エンドポイントから提供してください。

## 設定

`/config` で設定します。

| キー       | 既定値                                 | 内容                                                  |
| ---------- | -------------------------------------- | ----------------------------------------------------- |
| `lang`     | `ja`                                   | 翻訳先の言語（`ja` か `en`）                          |
| `endpoint` | `http://127.0.0.1:9931/v1/completions` | PLaMo 3 Translate を提供する `/v1/completions` の URL |
| `model`    | `plamo-3-translate-2b`                 | エンドポイント上のモデル名                            |
