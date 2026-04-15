import * as vscode from "vscode";
import { createBilingualMd, extractTextBlocks } from "./markdownParser";
import {
  translateBlocks,
  TranslateOptions,
  TranslateResult,
} from "./translator";

export class PreviewManager {
  private panels = new Map<
    string,
    { panel: vscode.WebviewPanel; translating: boolean }
  >();

  showPreview(document: vscode.TextDocument) {
    const uri = document.uri.toString();
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel already exists, update it
    if (this.panels.has(uri)) {
      const entry = this.panels.get(uri)!;
      entry.panel.reveal(column);
      this.updateContent(entry, document);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "vscodeTranslate.preview",
      `Translate: ${document.fileName.split("/").pop()}`,
      column ? column + 1 : vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );

    const entry = { panel, translating: false };
    this.panels.set(uri, entry);

    panel.onDidDispose(() => {
      this.panels.delete(uri);
    });

    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "toggle") {
        panel.webview.postMessage({ command: "toggle" });
      }
    });

    // Start rendering immediately, don't wait for webview ready message
    panel.webview.html = getLoadingHtml();
    this.updateContent(entry, document);
  }

  /**
   * Toggle translation visibility in the active preview panel.
   */
  toggleActive() {
    for (const [, entry] of this.panels) {
      if (entry.panel.active) {
        entry.panel.webview.postMessage({ command: "toggle" });
        return;
      }
    }
    vscode.window.showInformationMessage(
      "No active translation preview. Run 'Translate Markdown' first."
    );
  }

  private async updateContent(
    entry: { panel: vscode.WebviewPanel; translating: boolean },
    document: vscode.TextDocument
  ) {
    // Prevent concurrent translations
    if (entry.translating) return;
    entry.translating = true;

    const panel = entry.panel;

    try {
      const content = document.getText();
      const config = vscode.workspace.getConfiguration("vscodeTranslate");

      const apiKey = config.get<string>("apiKey");
      if (!apiKey) {
        panel.webview.html = getErrorHtml(
          "API Key not configured. Please set <code>vscodeTranslate.apiKey</code> in VS Code settings."
        );
        return;
      }

      const options: TranslateOptions = {
        apiEndpoint:
          config.get<string>("apiEndpoint") ||
          "https://api.openai.com/v1",
        apiKey,
        model: config.get<string>("model") || "gpt-4o-mini",
        targetLanguage:
          config.get<string>("targetLanguage") || "Chinese",
      };

      // Step 1: Render markdown with bilingual wrappers
      const md = createBilingualMd();
      const renderedHtml = md.render(content);

      // Step 2: Extract text blocks for translation
      const textBlocks = extractTextBlocks(renderedHtml);

      // Step 3: Send initial HTML (with loading placeholders)
      panel.webview.html = getFullHtml(renderedHtml);

      // Step 4: Translate and send progress updates
      if (textBlocks.size > 0) {
        await translateBlocks(
          textBlocks,
          options,
          (result: TranslateResult) => {
            panel.webview.postMessage({
              command: "translation",
              blockId: result.blockId,
              text: result.text,
            });
          }
        );

        panel.webview.postMessage({ command: "done" });
      } else {
        panel.webview.postMessage({ command: "done" });
      }
    } catch (err: any) {
      panel.webview.postMessage({
        command: "error",
        message: err.message || "Translation failed",
      });
    } finally {
      entry.translating = false;
    }
  }
}

function getFullHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Translate Preview</title>
  <style>
    :root {
      --original-color: var(--vscode-editor-foreground);
      --translation-color: #7cb342;
      --border-color: var(--vscode-panel-border, rgba(255,255,255,0.1));
      --bg-color: var(--vscode-editor-background);
      --font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      --font-size: var(--vscode-editor-font-size, 14px);
      --code-font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      --heading-color: var(--vscode-titleBar-activeForeground, var(--original-color));
    }

    body {
      font-family: var(--font-family);
      font-size: var(--font-size);
      color: var(--original-color);
      background: var(--bg-color);
      padding: 20px 40px;
      padding-bottom: 40px;
      line-height: 1.7;
      max-width: 900px;
      margin: 0 auto;
    }

    h1, h2, h3, h4, h5, h6 {
      color: var(--heading-color);
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
      margin-top: 24px;
    }
    h1 { font-size: 1.8em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.3em; }

    a { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; }
    a:hover { text-decoration: underline; }

    code {
      font-family: var(--code-font-family);
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.9em;
    }

    pre {
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
      padding: 12px 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; }

    blockquote {
      border-left: 4px solid var(--border-color);
      margin-left: 0;
      padding-left: 16px;
      color: var(--vscode-descriptionForeground, #888);
    }

    ul, ol { padding-left: 2em; }

    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid var(--border-color); padding: 8px 12px; text-align: left; }

    img { max-width: 100%; }

    /* Bilingual block styles */
    .bilingual-block { margin: 4px 0; padding: 6px 0; }

    .original-text { color: var(--original-color); }

    .translated-text {
      color: var(--translation-color);
      font-size: 0.93em;
      padding-left: 12px;
      border-left: 3px solid var(--translation-color);
      margin-top: 4px;
      margin-bottom: 4px;
      opacity: 0.9;
    }

    .translated-text.loading {
      color: var(--vscode-descriptionForeground, #888);
      font-style: italic;
      min-height: 1em;
    }
    .translated-text.loading::after {
      content: 'Translating...';
      animation: pulse 1.5s infinite;
    }

    .translated-text.error {
      color: var(--vscode-errorForeground, #f48771);
    }

    .hidden .translated-text { display: none; }

    @keyframes pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }

    /* Toolbar */
    .toolbar {
      position: fixed;
      top: 8px;
      right: 16px;
      z-index: 100;
      display: flex;
      gap: 8px;
    }
    .toolbar button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    .toolbar button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    /* Status bar */
    .status-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 4px 16px;
      background: var(--vscode-statusBar-background, #1e1e1e);
      color: var(--vscode-statusBar-foreground, #fff);
      font-size: 12px;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="toggleTranslations()">Toggle Translation</button>
  </div>
  <div id="content">${bodyHtml}</div>
  <div class="status-bar">
    <span id="status">Loading...</span>
    <span id="progress"></span>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let translationsHidden = false;
    let totalBlocks = 0;
    let translatedBlocks = 0;

    document.querySelectorAll('.translated-text.loading').forEach(() => totalBlocks++);

    window.addEventListener('message', event => {
      const msg = event.data;

      if (msg.command === 'translation') {
        const el = document.querySelector('.translated-text[data-id="' + msg.blockId + '"]');
        if (el) {
          el.textContent = msg.text;
          el.classList.remove('loading');
          translatedBlocks++;
          updateProgress();
        }
      }

      if (msg.command === 'done') {
        document.getElementById('status').textContent = 'Translation complete';
        document.getElementById('progress').textContent = '';
      }

      if (msg.command === 'error') {
        document.getElementById('status').textContent = 'Error: ' + msg.message;
        document.querySelectorAll('.translated-text.loading').forEach(el => {
          el.textContent = '[Error]';
          el.classList.add('error');
          el.classList.remove('loading');
        });
      }

      if (msg.command === 'toggle') {
        toggleTranslations();
      }
    });

    function toggleTranslations() {
      translationsHidden = !translationsHidden;
      document.querySelectorAll('.bilingual-block').forEach(el => {
        el.classList.toggle('hidden', translationsHidden);
      });
    }

    function updateProgress() {
      const pct = totalBlocks > 0 ? Math.round(translatedBlocks / totalBlocks * 100) : 0;
      document.getElementById('progress').textContent = translatedBlocks + '/' + totalBlocks + ' (' + pct + '%)';
      document.getElementById('status').textContent = 'Translating...';
    }

    // Signal ready
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}

function getLoadingHtml(): string {
  return `<!DOCTYPE html>
<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;
    font-family: var(--vscode-editor-font-family); color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background); }
</style></head>
<body><p>Loading...</p></body>
</html>`;
}

function getErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;
    font-family: var(--vscode-editor-font-family); color: var(--vscode-errorForeground);
    background: var(--vscode-editor-background); }
  .error { max-width: 500px; text-align: center; padding: 20px; }
  code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; }
</style></head>
<body><div class="error"><p>${message}</p></div></body>
</html>`;
}
