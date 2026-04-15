import * as fs from "fs";
import * as vscode from "vscode";
import { splitMarkdown, reassembleMarkdown, Segment } from "./markdownParser";
import { translateText, TranslateOptions } from "./translator";
import { TranslationCache } from "./translationCache";

/** Max characters per batch sent to the API */
const BATCH_SIZE = 4000;

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

  // Write initial file
  fs.writeFileSync(
    translatedPath,
    reassembleMarkdown(segments, translations),
    "utf8"
  );

  const batches = groupIntoBatches(pending, BATCH_SIZE);

  if (pending.length === 0) {
    const doc = await vscode.workspace.openTextDocument(translatedUri);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Two,
      preserveFocus: true,
    });
    vscode.window.showInformationMessage(
      "All translations loaded from cache."
    );
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Translate",
      cancellable: true,
    },
    async (progress, token) => {
      // Open editor
      const doc = await vscode.workspace.openTextDocument(translatedUri);
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Two,
        preserveFocus: true,
      });

      let completed = 0;

      // Fire ALL batches concurrently — each writes results to translations map
      const tasks = batches.map((batch) =>
        translateText(batch.content, options).then(
          (translated) => {
            const parts = translated.split(/\n{2,}/);
            for (let k = 0; k < batch.indices.length; k++) {
              const segIdx = batch.indices[k];
              if (k < parts.length && parts[k].trim()) {
                translations.set(segIdx, parts[k].trim());
                cache.set(segments[segIdx].content, parts[k].trim());
              }
            }
            completed++;
          },
          () => {
            // Fallback: translate segments individually
            return Promise.allSettled(
              batch.indices.map((segIdx) =>
                translateText(segments[segIdx].content, options).then((r) => {
                  translations.set(segIdx, r);
                  cache.set(segments[segIdx].content, r);
                })
              )
            ).finally(() => completed++);
          }
        )
      );

      // Refresh editor every 300ms with whatever's been translated so far
      const refreshInterval = setInterval(async () => {
        if (token.isCancellationRequested) return;
        await updateEditor(editor, segments, translations);
        cache.save();
        fs.writeFileSync(
          translatedPath,
          reassembleMarkdown(segments, translations),
          "utf8"
        );
        progress.report({ message: `${completed} / ${batches.length}` });
      }, 300);

      // Wait for all batches to finish
      await Promise.all(tasks);
      clearInterval(refreshInterval);

      // Final update
      await updateEditor(editor, segments, translations);
      cache.save();
      fs.writeFileSync(
        translatedPath,
        reassembleMarkdown(segments, translations),
        "utf8"
      );
      progress.report({ message: `${completed} / ${batches.length}` });
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
