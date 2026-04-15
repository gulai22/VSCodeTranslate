import * as vscode from "vscode";
import { PreviewManager } from "./previewManager";

let previewManager: PreviewManager;

export function activate(context: vscode.ExtensionContext) {
  previewManager = new PreviewManager();

  const translateCmd = vscode.commands.registerCommand(
    "vscodeTranslate.translate",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor");
        return;
      }

      const doc = editor.document;
      if (doc.languageId !== "markdown" && !doc.fileName.endsWith(".md")) {
        vscode.window.showWarningMessage("Please open a Markdown file first");
        return;
      }

      previewManager.showPreview(doc);
    }
  );

  const toggleCmd = vscode.commands.registerCommand(
    "vscodeTranslate.toggleTranslation",
    () => {
      previewManager.toggleActive();
    }
  );

  context.subscriptions.push(translateCmd, toggleCmd);
}

export function deactivate() {}
