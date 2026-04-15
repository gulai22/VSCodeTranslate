import * as fs from "fs";
import * as vscode from "vscode";
import { splitMarkdown, reassembleMarkdown, Segment } from "./markdownParser";
import { translateText, TranslateOptions } from "./translator";
import { TranslationCache } from "./translationCache";

/** Max characters per batch sent to the API */
const BATCH_SIZE = 3000;

/** Group consecutive pending segments into batches */
function groupIntoBatches(
  pending: { index: number; content: string }[],
  maxChars: number
): { indices: number[]; content: string }[] {
  const batches: { indices: number[]; content: string }[] = [];
  let indices: number[] = [];
  let joined = "";
  let len = 0;

  const flush = () => {
    if (indices.length > 0) {
      batches.push({ indices, content: joined });
      indices = [];
      joined = "";
      len = 0;
    }
  };

  for (const seg of pending) {
    if (len + seg.content.length > maxChars && indices.length > 0) {
      flush();
    }
    indices.push(seg.index);
    joined += (joined ? "\n\n" : "") + seg.content;
    len += seg.content.length;
  }
  flush();
  return batches;
}

export async function translateFile(document: vscode.TextDocument) {
  const config = vscode.workspace.getConfiguration("vscodeTranslate");
  const apiKey = config.get<string>("apiKey");
  if (!apiKey) {
    vscode.window.showErrorMessage(
      "Please set vscodeTranslate.apiKey in settings first."
    );
    return;
  }

  const options: TranslateOptions = {
    apiEndpoint:
      config.get<string>("apiEndpoint") || "https://api.openai.com/v1",
    apiKey,
    model: config.get<string>("model") || "gpt-4o-mini",
    targetLanguage: config.get<string>("targetLanguage") || "Chinese",
  };

  const originalPath = document.uri.fsPath;
  const translatedPath = originalPath.replace(/\.md$/, "_zh.md");
  const translatedUri = vscode.Uri.file(translatedPath);

  const content = document.getText();
  const segments = splitMarkdown(content);
  const cache = new TranslationCache(document.uri);

  // Identify which text segments need translation
  const pending: { index: number; content: string }[] = [];
  const translations = new Map<number, string>();

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type !== "text") continue;
    if (!segments[i].content.trim()) continue;

    const cached = cache.get(segments[i].content);
    if (cached) {
      translations.set(i, cached);
    } else {
      pending.push({ index: i, content: segments[i].content });
    }
  }

  // Write initial file and open editor (non-blocking for translation)
  const initialContent = reassembleMarkdown(segments, translations);
  fs.writeFileSync(translatedPath, initialContent, "utf8");

  const batches = groupIntoBatches(pending, BATCH_SIZE);

  if (pending.length === 0) {
    const doc = await vscode.workspace.openTextDocument(translatedUri);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Two,
      preserveFocus: true,
    });
    vscode.window.showInformationMessage("All translations loaded from cache.");
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Translate",
      cancellable: true,
    },
    async (progress, token) => {
      // Open editor while showing progress
      progress.report({ message: "Preparing..." });
      const doc = await vscode.workspace.openTextDocument(translatedUri);
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Two,
        preserveFocus: true,
      });

      for (let b = 0; b < batches.length; b++) {
        if (token.isCancellationRequested) break;

        const batch = batches[b];
        progress.report({
          message: `${b + 1} / ${batches.length}`,
        });

        try {
          const translated = await translateText(batch.content, options);
          const parts = translated.split(/\n{2,}/);

          for (let j = 0; j < batch.indices.length; j++) {
            const segIdx = batch.indices[j];
            if (j < parts.length && parts[j].trim()) {
              translations.set(segIdx, parts[j].trim());
              cache.set(segments[segIdx].content, parts[j].trim());
            }
          }
        } catch {
          for (const segIdx of batch.indices) {
            try {
              const result = await translateText(
                segments[segIdx].content,
                options
              );
              translations.set(segIdx, result);
              cache.set(segments[segIdx].content, result);
            } catch {
              // Skip failed segment
            }
          }
        }

        await updateEditor(editor, segments, translations);

        // Save cache after each batch so progress survives cancellation
        cache.save();
        fs.writeFileSync(
          translatedPath,
          reassembleMarkdown(segments, translations),
          "utf8"
        );

        if (b + 1 < batches.length) {
          await sleep(100);
        }
      }
    }
  );
}

async function updateEditor(
  editor: vscode.TextEditor,
  segments: Segment[],
  translations: Map<number, string>
) {
  const newContent = reassembleMarkdown(segments, translations);
  const doc = editor.document;
  const fullRange = new vscode.Range(
    doc.positionAt(0),
    doc.positionAt(doc.getText().length)
  );
  await editor.edit((builder) => builder.replace(fullRange, newContent));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
