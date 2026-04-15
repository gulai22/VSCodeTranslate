import * as vscode from "vscode";
import { translateFile } from "./fileTranslator";

export function activate(context: vscode.ExtensionContext) {
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

      translateFile(doc);
    }
  );

  context.subscriptions.push(translateCmd);
}

export function deactivate() {}
