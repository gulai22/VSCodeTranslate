# VSCode Translate

A VS Code extension that translates Markdown files and saves the result as a side-by-side `_zh.md` file, inspired by [kiss-translator](https://github.com/fishjar/kiss-translator).

Open any `.md` file, run the command, and a translated version opens next to the original — translations appear in real-time as each batch completes.

## Features

- **File-based output** — generates `xxx_zh.md` alongside the original, open both side-by-side
- **Translation cache** — saves to `xxx.translate.json`, skips unchanged paragraphs on re-run
- **Incremental display** — see translations fill in block by block, no waiting for the full file
- **Works with any OpenAI-compatible API** — Zhipu (GLM), DeepSeek, OpenAI, Ollama, etc.
- **Smart markdown protection** — image captions are translated, URLs/paths/code are preserved

## Quick Start

### 1. Configure API

Open VS Code settings (`Ctrl+,`) and set:

| Setting | Description | Example |
|---------|-------------|---------|
| `vscodeTranslate.apiEndpoint` | OpenAI-compatible base URL | `https://open.bigmodel.cn/api/paas/v4` |
| `vscodeTranslate.apiKey` | Your API key | `your-api-key` |
| `vscodeTranslate.model` | Model name | `glm-4-flash`, `deepseek-chat` |
| `vscodeTranslate.targetLanguage` | Target language | `Chinese` (default) |

### 2. Translate

1. Open a `.md` file in VS Code
2. Click the **zh** button in the editor title bar, or press `Ctrl+Shift+P` → run **"Translate Markdown (Bilingual Preview)"**
3. The translated `xxx_zh.md` opens on the right, translations appear as they complete
4. Run the command again on the same file — cached blocks load instantly, no API cost

### 3. File layout

```
my-paper/
├── my-paper.md              # Original
├── my-paper_zh.md           # Generated translation
└── my-paper.translate.json  # Translation cache
```

## Supported API Providers

Any service that provides an OpenAI-compatible `/chat/completions` endpoint:

| Provider | Endpoint | Model |
|----------|----------|-------|
| Zhipu (GLM) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3` |

## Architecture

```
src/
├── extension.ts         # Command registration and activation
├── fileTranslator.ts    # Main workflow: parse → cache → translate → write
├── markdownParser.ts    # Split markdown into text/code segments
├── translator.ts        # OpenAI-compatible API client with URL protection
└── translationCache.ts  # JSON-based cache keyed by text hash
```

- Markdown is split into segments by blank lines; code blocks are skipped
- Image/link URLs are replaced with placeholders before translation, restored after — so `![caption](path)` gets the caption translated but the path preserved
- Consecutive text segments are batched (~3000 chars) to reduce API calls
- After each batch, the editor content updates in-place via `TextEditor.edit()`

## Development

```bash
npm install           # Install dependencies
npm run compile       # Production build (esbuild → dist/extension.js)
npm run watch         # Dev build with watch + sourcemaps
npm run lint          # TypeScript type check (tsc --noEmit)
```

Press **F5** in VS Code to launch Extension Development Host for testing.

## License

MIT
