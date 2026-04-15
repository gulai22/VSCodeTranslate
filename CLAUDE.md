# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VSCode Translate — a VS Code extension that provides bilingual (side-by-side) translation for Markdown files, similar to kiss-translator. Uses OpenAI-compatible APIs for translation.

## Build & Develop

```bash
npm install              # Install dependencies
npm run compile          # Production build (esbuild → dist/extension.js)
npm run watch            # Development build with watch mode + sourcemaps
npm run lint             # TypeScript type check (tsc --noEmit)
```

To test: F5 in VS Code opens Extension Development Host. Open a .md file, run "Translate Markdown (Bilingual Preview)" from command palette.

## Architecture

- **`src/extension.ts`** — Extension entry point. Registers `vscodeTranslate.translate` and `toggleTranslation` commands. Activates on `onLanguage:markdown`.
- **`src/previewManager.ts`** — Creates and manages Webview panels. Orchestrates the render → translate → stream pipeline. Contains all HTML/CSS/JS for the webview (inline template).
- **`src/markdownParser.ts`** — Uses markdown-it with custom renderer rules to wrap each translatable block (headings, paragraphs, list items) in `<div class="bilingual-block">` containers. `extractTextBlocks()` recovers plain text from the rendered HTML for API calls.
- **`src/translator.ts`** — OpenAI-compatible API client. Batches blocks into requests (~2000 chars each). Uses native `http`/`https` modules (no fetch dependency).

## Key Design Decisions

- Webview panel (not `previewScripts`) — full control over async translation lifecycle, streaming updates, and DOM manipulation.
- Translation is non-streaming per batch (single API call per batch), but results are streamed to the webview block-by-block as each batch completes.
- Translation blocks are identified by `data-id` attributes in the rendered HTML, matched between parser extraction and webview DOM updates.
- Bundled with esbuild (markdown-it is bundled in, vscode is external).

## Settings

All user-configurable via `vscodeTranslate.*`:
- `apiEndpoint` — OpenAI-compatible base URL
- `apiKey` — API key (required)
- `model` — model name
- `targetLanguage` — target language name (e.g. "Chinese", "Japanese")
