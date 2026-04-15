import MarkdownIt from "markdown-it";

/**
 * Create a markdown-it instance with custom renderer rules that wrap
 * each translatable block in bilingual containers.
 *
 * Blocks wrapped: headings, paragraphs (including inside list items and blockquotes).
 * Not wrapped: code blocks, tables, raw HTML.
 */
export function createBilingualMd(): MarkdownIt {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  let blockIndex = 0;

  // Helper to render opening wrapper + original tag
  function renderOpen(
    tokens: MarkdownIt.Token[],
    idx: number
  ): string {
    const id = blockIndex++;
    const token = tokens[idx];
    const tag = token.tag || "p";
    // For hidden paragraphs (tight list items), skip the <p> tag
    const tagOpen = token.hidden ? "" : `<${tag}>`;
    return `<div class="bilingual-block" data-id="${id}"><div class="original-text">${tagOpen}`;
  }

  // Helper to render closing original tag + translation placeholder
  function renderClose(
    tokens: MarkdownIt.Token[],
    idx: number
  ): string {
    const token = tokens[idx];
    const tag = token.tag || "p";
    const tagClose = token.hidden ? "" : `</${tag}>`;
    return `${tagClose}</div><div class="translated-text loading" data-id="${blockIndex - 1}"></div></div>`;
  }

  // Override paragraph renderer
  md.renderer.rules.paragraph_open = (tokens, idx, options, _env, _self) => {
    return renderOpen(tokens, idx);
  };
  md.renderer.rules.paragraph_close = (tokens, idx, options, _env, _self) => {
    return renderClose(tokens, idx);
  };

  // Override heading renderer
  md.renderer.rules.heading_open = (tokens, idx, options, _env, _self) => {
    return renderOpen(tokens, idx);
  };
  md.renderer.rules.heading_close = (tokens, idx, options, _env, _self) => {
    return renderClose(tokens, idx);
  };

  // NOTE: list_item_open/close are NOT overridden.
  // Paragraphs inside list items are wrapped individually, which produces
  // valid HTML (<div> inside <li> is fine) and avoids double-wrapping.

  // Reset block index before each render
  md.core.ruler.push("reset_block_index", () => {
    blockIndex = 0;
    return true;
  });

  return md;
}

/**
 * Extract translatable text blocks from rendered bilingual HTML.
 * Returns a map of block ID → plain text for translation.
 */
export function extractTextBlocks(html: string): Map<number, string> {
  const blocks = new Map<number, string>();
  // Match: data-id="N" ... class="original-text">CONTENT</div>  <div class="translated-text
  const regex =
    /data-id="(\d+)"[^>]*><div class="original-text">([\s\S]*?)<\/div>\s*<div class="translated-text/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const id = parseInt(match[1]);
    const rawHtml = match[2];
    // Strip HTML tags to get plain text, normalize whitespace
    const text = rawHtml
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      blocks.set(id, text);
    }
  }
  return blocks;
}
