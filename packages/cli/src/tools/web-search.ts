import { MistralTool, ToolExecutor } from "./types.js";

export const TAVILY_API_ENDPOINT = "https://api.tavily.com/search";

export interface WebSearchArgs {
  query: string;
  max_results?: number;
  search_depth?: "basic" | "advanced";
  include_answer?: boolean;
  include_domains?: string[];
}

export interface TavilySearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  query: string;
  answer?: string;
  results: TavilySearchResultItem[];
}

export const webSearchToolDefinition: MistralTool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the live web for up-to-date documentation, real-time facts, APIs, package releases, and technical articles via Tavily.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords or question to look up on the web.",
        },
        max_results: {
          type: "number",
          description: "Maximum number of search results to return (1-10, default: 5).",
        },
        search_depth: {
          type: "string",
          enum: ["basic", "advanced"],
          description:
            "Search depth: 'advanced' (recommended default for accurate technical answers) or 'basic' (faster).",
        },
        include_answer: {
          type: "boolean",
          description: "Whether to include Tavily's direct synthesized answer to the query.",
        },
        include_domains: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "Optional list of domains to restrict search to (e.g., ['pypi.org', 'github.com', 'readthedocs.io']).",
        },
      },
      required: ["query"],
    },
  },
};

export async function executeWebSearch(
  args: WebSearchArgs,
  apiKey: string = process.env.TAVILY_API_KEY || ""
): Promise<string> {
  const query = args.query?.trim();
  if (!query) {
    return JSON.stringify({
      error: "Missing required argument 'query'.",
    });
  }

  const resolvedKey = apiKey.trim();
  if (!resolvedKey) {
    return JSON.stringify({
      error:
        "TAVILY_API_KEY is not configured. Please define TAVILY_API_KEY in your environment or .env file to enable web search (get a key at https://tavily.com).",
    });
  }

  const maxResults = Math.min(Math.max(args.max_results ?? 5, 1), 10);
  const searchDepth = args.search_depth === "basic" ? "basic" : "advanced";
  const includeAnswer = args.include_answer ?? true;
  const includeDomains =
    Array.isArray(args.include_domains) && args.include_domains.length > 0
      ? args.include_domains
      : undefined;

  try {
    const payload: Record<string, unknown> = {
      api_key: resolvedKey,
      query,
      search_depth: searchDepth,
      include_answer: includeAnswer,
      max_results: maxResults,
    };
    if (includeDomains) {
      payload.include_domains = includeDomains;
    }

    const response = await fetch(TAVILY_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorJson = (await response.json()) as any;
        detail = errorJson.detail?.error || errorJson.message || JSON.stringify(errorJson);
      } catch {
        detail = response.statusText;
      }
      return JSON.stringify({
        error: `Tavily API search failed with HTTP status ${response.status}: ${detail}`,
      });
    }

    const data = (await response.json()) as TavilySearchResponse;

    const trimmedResults = (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.length > 1000 ? r.content.slice(0, 1000) + "..." : r.content,
      score: r.score,
    }));

    return JSON.stringify(
      {
        query: data.query || query,
        answer: data.answer || null,
        results_count: trimmedResults.length,
        results: trimmedResults,
      },
      null,
      2
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      error: `Network failure or timeout while reaching Tavily search API: ${msg}`,
    });
  }
}

export const webSearchToolExecutor: ToolExecutor<WebSearchArgs> = {
  definition: webSearchToolDefinition,
  execute: async (args) => {
    return executeWebSearch(args);
  },
};
