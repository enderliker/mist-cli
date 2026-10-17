import { MistralTool, ToolExecutor } from "./types.js";

export const TAVILY_EXTRACT_ENDPOINT = "https://api.tavily.com/extract";

export interface FetchWebPageArgs {
  url: string;
  max_length?: number;
}

export const fetchWebPageToolDefinition: MistralTool = {
  type: "function",
  function: {
    name: "fetch_web_page",
    description:
      "Fetches and extracts readable text or markdown content from a web page URL. Ideal for reading documentation, articles, or API references discovered via web_search.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full HTTP or HTTPS URL to fetch content from.",
        },
        max_length: {
          type: "number",
          description:
            "Maximum number of characters to return (default: 20000, max: 50000).",
        },
      },
      required: ["url"],
    },
  },
};

export function cleanHtmlToMarkdown(html: string): string {
  let text = html;

  // Extract title if present
  let title = "";
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  // Remove scripts, styles, noscript, svg, navigation, footer, header
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  text = text.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ");
  text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ");
  text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ");
  text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ");

  // Convert headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  text = text.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n\n#### $1\n\n");

  // Convert list items and paragraphs
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n* $1");
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n---\n");

  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&copy;/g, "©")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");

  // Normalize excessive whitespaces and empty lines
  text = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (title && !text.startsWith("# ")) {
    text = `# ${title}\n\n${text}`;
  }

  return text;
}

export async function executeFetchWebPage(
  args: FetchWebPageArgs,
  apiKey: string = process.env.TAVILY_API_KEY || ""
): Promise<string> {
  const rawUrl = args.url?.trim();
  if (!rawUrl) {
    return JSON.stringify({
      error: "Missing required argument 'url'.",
    });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return JSON.stringify({
        error: `Invalid URL protocol '${parsedUrl.protocol}'. Only http: and https: are allowed.`,
      });
    }
  } catch {
    return JSON.stringify({
      error: `Invalid URL '${rawUrl}'. Please provide a valid HTTP or HTTPS address.`,
    });
  }

  const maxLength = Math.min(Math.max(args.max_length ?? 20000, 500), 50000);

  // 1. Try Tavily Extract if API key is available
  if (apiKey.trim()) {
    try {
      const tavilyRes = await fetch(TAVILY_EXTRACT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey.trim(),
          urls: [rawUrl],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (tavilyRes.ok) {
        const data = (await tavilyRes.json()) as any;
        const result = data.results?.[0];
        if (result && result.raw_content) {
          let content = result.raw_content.trim();
          let truncated = false;
          if (content.length > maxLength) {
            content =
              content.slice(0, maxLength) +
              `\n\n[Content truncated at ${maxLength} characters]`;
            truncated = true;
          }

          return JSON.stringify(
            {
              url: rawUrl,
              title: result.title || null,
              engine: "tavily_extract",
              length: content.length,
              truncated,
              content,
            },
            null,
            2
          );
        }
      }
    } catch {
      // Fall through to native fetch on error
    }
  }

  // 2. Native fetch fallback
  try {
    const response = await fetch(rawUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return JSON.stringify({
        error: `Failed to fetch URL with HTTP status ${response.status} (${response.statusText}).`,
      });
    }

    const html = await response.text();
    let content = cleanHtmlToMarkdown(html);

    let truncated = false;
    if (content.length > maxLength) {
      content =
        content.slice(0, maxLength) +
        `\n\n[Content truncated at ${maxLength} characters]`;
      truncated = true;
    }

    return JSON.stringify(
      {
        url: rawUrl,
        engine: "native_fetch",
        length: content.length,
        truncated,
        content,
      },
      null,
      2
    );
  } catch (err: any) {
    return JSON.stringify({
      error: `Network failure while fetching '${rawUrl}': ${err.message}`,
    });
  }
}

export const fetchWebPageToolExecutor: ToolExecutor<FetchWebPageArgs> = {
  definition: fetchWebPageToolDefinition,
  execute: async (args) => {
    return executeFetchWebPage(args);
  },
};
