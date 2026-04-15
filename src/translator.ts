import * as https from "https";
import * as http from "http";

export interface TranslateOptions {
  apiEndpoint: string;
  apiKey: string;
  model: string;
  targetLanguage: string;
}

export interface TranslateResult {
  blockId: number;
  text: string;
}

const SYSTEM_PROMPT = `You are a professional translator. Translate the user's text to the target language.
Rules:
- Preserve all markdown formatting (headings, lists, links, images, inline code, etc.)
- Do not translate code blocks, inline code, URLs, or image paths
- Keep the same paragraph structure
- Output ONLY the translated text, nothing else`;

/**
 * Translate a batch of text blocks using OpenAI-compatible API.
 * Groups blocks into fewer requests to reduce API calls.
 */
export async function translateBlocks(
  blocks: Map<number, string>,
  options: TranslateOptions,
  onProgress?: (result: TranslateResult) => void
): Promise<Map<number, string>> {
  const translations = new Map<number, string>();

  if (blocks.size === 0) return translations;

  // Smaller batches to avoid token limits and timeouts
  const batches = splitIntoBatches(blocks, 1200);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const blockTexts = Array.from(batch.entries());

    // Translate each block individually within the batch for reliability
    // Use parallel requests with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < blockTexts.length; i += concurrency) {
      const chunk = blockTexts.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(([blockId, text]) => translateSingle(text, options))
      );

      for (let j = 0; j < chunk.length; j++) {
        const [blockId, originalText] = chunk[j];
        const result = results[j];
        if (result.status === "fulfilled" && result.value) {
          translations.set(blockId, result.value);
          onProgress?.({ blockId, text: result.value });
        } else {
          const errorMsg =
            result.status === "rejected"
              ? String(result.reason?.message || result.reason)
              : "Empty response";
          translations.set(blockId, `[Error: ${errorMsg}]`);
          onProgress?.({ blockId, text: `[Error: ${errorMsg}]` });
        }
      }

      // Small delay between chunks to avoid rate limiting
      if (i + concurrency < blockTexts.length) {
        await sleep(200);
      }
    }
  }

  return translations;
}

/**
 * Translate a single text block via the API with retry.
 */
export async function translateSingle(
  text: string,
  options: TranslateOptions
): Promise<string> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const prompt = `Translate the following text to ${options.targetLanguage}. Output ONLY the translation, nothing else.\n\n${text}`;
      return await callOpenAI(prompt, options);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      // Wait before retry with exponential backoff
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error("Max retries exceeded");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitIntoBatches(
  blocks: Map<number, string>,
  maxChars: number
): Map<number, string>[] {
  const batches: Map<number, string>[] = [];
  let current = new Map<number, string>();
  let currentLen = 0;

  for (const [id, text] of blocks) {
    if (currentLen + text.length > maxChars && current.size > 0) {
      batches.push(current);
      current = new Map();
      currentLen = 0;
    }
    current.set(id, text);
    currentLen += text.length;
  }

  if (current.size > 0) {
    batches.push(current);
  }

  return batches;
}

function callOpenAI(
  prompt: string,
  options: TranslateOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${options.apiEndpoint}/chat/completions`);
    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? https : http;

    const body = JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      stream: false,
    });

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = httpModule.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk: string | Buffer) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(
            new Error(
              `API error ${res.statusCode}: ${data.slice(0, 200)}`
            )
          );
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error("Empty response from API"));
            return;
          }
          resolve(content.trim());
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error("API request timeout (120s)"));
    });
    req.write(body);
    req.end();
  });
}
