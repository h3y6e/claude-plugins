# dubbed

Shows Claude's replies dubbed into Japanese or English, with the original folded below. The reply itself is left as written.

![dubbed example](assets/example.png)

## Install

```sh
claude plugin marketplace add h3y6e/claude-plugins
claude plugin install dubbed@h3y6e
```

It translates with [PLaMo 3 Translate](https://huggingface.co/collections/pfnet/plamo-3-translate), so serve it on an OpenAI-compatible completions endpoint, e.g. with [llama.cpp](https://github.com/ggml-org/llama.cpp).

## Settings

Set in `/config`.

| Key        | Default                                | What it sets                                    |
| ---------- | -------------------------------------- | ----------------------------------------------- |
| `lang`     | `ja`                                   | Language replies are dubbed into, `ja` or `en`  |
| `endpoint` | `http://127.0.0.1:9931/v1/completions` | `/v1/completions` URL serving PLaMo 3 Translate |
| `model`    | `plamo-3-translate-2b`                 | Model name the endpoint serves it under         |
