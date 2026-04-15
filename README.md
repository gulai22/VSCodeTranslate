# VSCode Translate

A VS Code extension that provides bilingual (side-by-side) translation for Markdown files, inspired by [kiss-translator](https://github.com/fishjar/kiss-translator).

Open any `.md` file, run the command, and see translations appear below each paragraph/heading — just like bilingual translation in your browser.

## Features

- **Bilingual preview** — each paragraph, heading, list item, and blockquote shows the original text with a translation directly below it
- **Works with any OpenAI-compatible API** — Zhipu (GLM), DeepSeek, OpenAI, Ollama, etc.
- **Block-by-block progress** — see translations appear one by one as the API returns results
- **Toggle translations** — hide/show all translations with one click
- **Preserves formatting** — code blocks, tables, inline code, and links are left untouched

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
2. Press `Ctrl+Shift+P` to open the command palette
3. Run **"Translate Markdown (Bilingual Preview)"**
4. A preview panel opens on the right with translations loading block by block

### 3. Toggle translations

Click the **"Toggle Translation"** button in the top-right corner of the preview panel, or run **"Toggle Translation Visibility"** from the command palette.

## Supported API Providers

Any service that provides an OpenAI-compatible `/chat/completions` endpoint works:

| Provider | Endpoint | Model |
|----------|----------|-------|
| Zhipu (GLM) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3` |

## Architecture

```
src/
├── extension.ts        # Command registration and activation
├── markdownParser.ts   # markdown-it with bilingual wrapper rendering
├── previewManager.ts   # Webview panel lifecycle and translation orchestration
└── translator.ts       # OpenAI-compatible API client with retry logic
```

The extension uses a markdown-it plugin to wrap each translatable block in bilingual containers, then sends the extracted text to the translation API and streams results back to the webview.

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
