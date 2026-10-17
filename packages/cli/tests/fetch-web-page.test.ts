import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWebPageToolDefinition,
  cleanHtmlToMarkdown,
  executeFetchWebPage,
  TAVILY_EXTRACT_ENDPOINT,
} from "../src/tools/fetch-web-page.js";

describe("fetch_web_page Tool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exposes the correct tool definition schema", () => {
    expect(fetchWebPageToolDefinition.type).toBe("function");
    expect(fetchWebPageToolDefinition.function.name).toBe("fetch_web_page");
    expect(fetchWebPageToolDefinition.function.parameters.required).toContain("url");
  });

  it("returns error for missing url or invalid protocol", async () => {
    const resEmpty = await executeFetchWebPage({ url: "   " });
    expect(JSON.parse(resEmpty).error).toContain("Missing required argument 'url'");

    const resInvalid = await executeFetchWebPage({ url: "ftp://example.com/file" });
    expect(JSON.parse(resInvalid).error).toContain("Invalid URL protocol");

    const resMalformed = await executeFetchWebPage({ url: "not a valid url" });
    expect(JSON.parse(resMalformed).error).toContain("Invalid URL");
  });

  it("cleanHtmlToMarkdown strips scripts/styles and formats headings/paragraphs", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page</title>
          <style>body { color: red; }</style>
        </head>
        <body>
          <script>console.log("bad");</script>
          <nav><a href="/">Home</a></nav>
          <h1>Main Title</h1>
          <p>This is a paragraph with a <a href="https://example.com">link</a>.</p>
          <h2>Subheading</h2>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
          <footer>Footer text</footer>
        </body>
      </html>
    `;

    const markdown = cleanHtmlToMarkdown(html);
    expect(markdown).toContain("# Main Title");
    expect(markdown).toContain("This is a paragraph");
    expect(markdown).toContain("## Subheading");
    expect(markdown).toContain("* Item 1");
    expect(markdown).toContain("* Item 2");
    expect(markdown).not.toContain("console.log");
    expect(markdown).not.toContain("body { color: red; }");
    expect(markdown).not.toContain("Footer text");
  });

  it("uses Tavily Extract API when apiKey is provided and succeeds", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            url: "https://example.com/docs",
            title: "Docs Title",
            raw_content: "Extracted documentation content.",
          },
        ],
      }),
    });
    globalThis.fetch = fetchSpy as any;

    const res = await executeFetchWebPage(
      { url: "https://example.com/docs" },
      "tvly-mock-key"
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchSpy.mock.calls[0];
    expect(endpoint).toBe(TAVILY_EXTRACT_ENDPOINT);
    expect(JSON.parse(options.body).api_key).toBe("tvly-mock-key");

    const parsed = JSON.parse(res);
    expect(parsed.engine).toBe("tavily_extract");
    expect(parsed.title).toBe("Docs Title");
    expect(parsed.content).toBe("Extracted documentation content.");
  });

  it("falls back to native fetch when no Tavily apiKey is provided", async () => {
    const html = `<h1>Native Content</h1><p>Fetched without Tavily.</p>`;
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    });
    globalThis.fetch = fetchSpy as any;

    const res = await executeFetchWebPage({ url: "https://example.com/native" }, "");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://example.com/native");

    const parsed = JSON.parse(res);
    expect(parsed.engine).toBe("native_fetch");
    expect(parsed.content).toContain("# Native Content");
    expect(parsed.content).toContain("Fetched without Tavily.");
  });

  it("handles HTTP error status gracefully in native fetch", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    globalThis.fetch = fetchSpy as any;

    const res = await executeFetchWebPage({ url: "https://example.com/404" }, "");
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("HTTP status 404");
  });

  it("truncates content exceeding max_length", async () => {
    const longHtml = `<p>${"a".repeat(1000)}</p>`;
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => longHtml,
    });
    globalThis.fetch = fetchSpy as any;

    const res = await executeFetchWebPage(
      { url: "https://example.com/long", max_length: 500 },
      ""
    );

    const parsed = JSON.parse(res);
    expect(parsed.truncated).toBe(true);
    expect(parsed.content).toContain("[Content truncated at 500 characters]");
  });
});
