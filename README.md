# VSCode Translate

A VS Code extension that provides bilingual (side-by-side) translation for Markdown files, similar to [kiss-translator](https://github.com/fishjar/kiss-translator).

## Features

- Open any `.md` file and run "Translate Markdown (Bilingual Preview)" to see the original text with translations below each paragraph/heading
- Supports any OpenAI-compatible API (OpenAI, DeepSeek, Claude via compatible endpoint, Ollama, etc.)
- Progress indicator shows translation status block by block
- Toggle translation visibility with the toolbar button

## Getting Started

1. Install the extension
2. Configure your translation API in VS Code settings:
   - `vscodeTranslate.apiEndpoint` — e.g. `https://api.deepseek.com/v1`
   - `vscodeTranslate.apiKey` — your API key
   - `vscodeTranslate.model` — e.g. `deepseek-chat`
   - `vscodeTranslate.targetLanguage` — e.g. `Chinese` (default)
3. Open a Markdown file
4. Run "Translate Markdown (Bilingual Preview)" from the command palette (`Ctrl+Shift+P`)

## Development

```bash
npm install
npm run compile    # Build
npm run watch      # Dev with watch
```

Press F5 to launch Extension Development Host for testing.
