import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  webSearchToolDefinition,
  executeWebSearch,
  TAVILY_API_ENDPOINT,
} from "../src/tools/web-search.js";
import { getAllToolDefinitions, executeTool } from "../src/tools/index.js";

describe("web_search Tool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exposes the correct tool definition schema", () => {
    expect(webSearchToolDefinition.type).toBe("function");
    expect(webSearchToolDefinition.function.name).toBe("web_search");
    expect(webSearchToolDefinition.function.parameters.required).toContain("query");
    expect(
      (webSearchToolDefinition.function.parameters.properties as any).query
    ).toBeDefined();
    expect(
      (webSearchToolDefinition.function.parameters.properties as any).max_results
    ).toBeDefined();
  });

  it("registers in getAllToolDefinitions", () => {
    const all = getAllToolDefinitions();
    const found = all.find((t) => t.function.name === "web_search");
    expect(found).toBeDefined();
  });

  it("returns error if query is missing or empty", async () => {
    const res = await executeWebSearch({ query: "   " }, "test-key");
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("Missing required argument 'query'");
  });

  it("returns user-friendly error if TAVILY_API_KEY is not configured", async () => {
    const res = await executeWebSearch({ query: "vitest typescript" }, "");
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("TAVILY_API_KEY is not configured");
    expect(parsed.error).toContain("https://tavily.com");
  });

  it("executes search successfully and formats response", async () => {
    const mockResponse = {
      query: "node.js 22 release",
      answer: "Node.js 22 includes built-in WebSocket and V8 12.4.",
      results: [
        {
          title: "Node v22.0.0 (Current)",
          url: "https://nodejs.org/en/blog/release/v22.0.0",
          content: "Node.js 22 is now available with new features and performance enhancements.",
          score: 0.98,
        },
      ],
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    globalThis.fetch = fetchSpy as any;

    const res = await executeWebSearch(
      {
        query: "node.js 22 release",
        max_results: 3,
        search_depth: "basic",
      },
      "tvly-mock-key"
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchSpy.mock.calls[0];
    expect(endpoint).toBe(TAVILY_API_ENDPOINT);
    expect(options.method).toBe("POST");

    const sentBody = JSON.parse(options.body);
    expect(sentBody.api_key).toBe("tvly-mock-key");
    expect(sentBody.query).toBe("node.js 22 release");
    expect(sentBody.max_results).toBe(3);
    expect(sentBody.search_depth).toBe("basic");

    const parsed = JSON.parse(res);
    expect(parsed.query).toBe("node.js 22 release");
    expect(parsed.answer).toBe("Node.js 22 includes built-in WebSocket and V8 12.4.");
    expect(parsed.results_count).toBe(1);
    expect(parsed.results[0].title).toBe("Node v22.0.0 (Current)");
    expect(parsed.results[0].url).toBe("https://nodejs.org/en/blog/release/v22.0.0");
  });

  it("defaults search_depth to advanced and includes include_domains in payload", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ query: "test", results: [] }),
    });
    globalThis.fetch = fetchSpy as any;

    await executeWebSearch(
      {
        query: "discord.py",
        include_domains: ["pypi.org", "github.com"],
      },
      "tvly-mock-key"
    );

    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(sentBody.search_depth).toBe("advanced");
    expect(sentBody.include_domains).toEqual(["pypi.org", "github.com"]);
  });

  it("handles HTTP error status gracefully without throwing", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ detail: { error: "Invalid API key" } }),
    });
    globalThis.fetch = fetchSpy as any;

    const res = await executeWebSearch({ query: "test" }, "invalid-key");
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("Tavily API search failed with HTTP status 401");
    expect(parsed.error).toContain("Invalid API key");
  });

  it("handles network failures and timeouts gracefully without throwing", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("Connection refused"));
    globalThis.fetch = fetchSpy as any;

    const res = await executeWebSearch({ query: "test" }, "test-key");
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("Network failure or timeout");
    expect(parsed.error).toContain("Connection refused");
  });

  it("dispatches through executeTool registry", async () => {
    const res = await executeTool("web_search", { query: "" });
    const parsed = JSON.parse(res);
    expect(parsed.error).toBeDefined();
  });
});
