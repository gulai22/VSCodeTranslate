import * as https from "https";
import * as http from "http";

export interface TranslateOptions {
  apiEndpoint: string;
  apiKey: string;
  model: string;
  targetLanguage: string;
}

const SYSTEM_PROMPT = `You are a professional translator. Translate the user's text to the target language.
Rules:
- Preserve all markdown formatting (headings, lists, links, images, inline code, etc.)
- Do NOT modify any placeholder tokens like __IMG0__, __LNK0__, __CODE0__
- Do not translate URLs or image paths
- Keep the same paragraph structure
- Output ONLY the translated text, nothing else`;

/**
 * Protect URLs/paths in markdown syntax from being garbled by the model.
 * Only the URL part is replaced with a placeholder — alt text / link text
 * is left in place so the model can translate it.
 */
function protect(text: string): { protected: string; tokens: string[] } {
  const tokens: string[] = [];
  let result = text;

  // Single-pass regex for both images and links to avoid re-matching
  result = result.replace(
    /(!?)\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, bang, label, url) => {
      tokens.push(url);
      return `${bang}[${label}](__URL${tokens.length - 1}__)`;
    }
  );

  // Protect inline code: `code` → __CODE0__
  result = result.replace(/`([^`]+)`/g, (match) => {
    tokens.push(match);
    return `__CODE${tokens.length - 1}__`;
  });

  return { protected: result, tokens };
}

function restore(text: string, tokens: string[]): string {
  let result = text;
  for (let i = tokens.length - 1; i >= 0; i--) {
    // CODE placeholders are full matches like `code`
    const codeRe = new RegExp(`__CODE${i}__`, "g");
    // URL placeholders are inside (...) — restore the URL
    const urlRe = new RegExp(`__URL${i}__`, "g");
    result = result.replace(codeRe, tokens[i]).replace(urlRe, tokens[i]);
  }
  return result;
}

export async function translateText(
  text: string,
  options: TranslateOptions
): Promise<string> {
  const { protected: protectedText, tokens } = protect(text);

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const prompt = `Translate the following text to ${options.targetLanguage}. Output ONLY the translation, nothing else.\n\n${protectedText}`;
      const raw = await callOpenAI(prompt, options);
      return restore(raw, tokens);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error("Max retries exceeded");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        } catch {
          reject(
            new Error(
              `Failed to parse API response: ${data.slice(0, 200)}`
            )
          );
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
