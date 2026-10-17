import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  searchFilesToolDefinition,
  executeSearchFiles,
} from "../src/tools/search-files.js";

describe("search_files Tool", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "search-test-"));

    // Create file tree
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "node_modules", "pkg"), { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, "src", "index.ts"),
      `export function helloWorld() {\n  console.log("Hello from index");\n  return 42;\n}\n`
    );

    fs.writeFileSync(
      path.join(tempDir, "src", "utils.ts"),
      `export const GREETING = "hello world";\nexport function compute() {\n  return 100;\n}\n`
    );

    fs.writeFileSync(
      path.join(tempDir, "README.md"),
      `# Project\nSay hello to everyone.\n`
    );

    // Noisy directory that should be ignored
    fs.writeFileSync(
      path.join(tempDir, "node_modules", "pkg", "ignored.ts"),
      `export const hello = "ignored hello";\n`
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("exposes the correct tool definition schema", () => {
    expect(searchFilesToolDefinition.type).toBe("function");
    expect(searchFilesToolDefinition.function.name).toBe("search_files");
    expect(searchFilesToolDefinition.function.parameters.required).toContain("pattern");
  });

  it("returns error if pattern is empty", async () => {
    const res = await executeSearchFiles({ pattern: "   " }, tempDir);
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("Missing required argument 'pattern'");
  });

  it("rejects path traversal outside workspace", async () => {
    const res = await executeSearchFiles({ pattern: "hello", path: "../outside" }, tempDir);
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("outside the allowed workspace");
  });

  it("rejects non-existent directory", async () => {
    const res = await executeSearchFiles({ pattern: "hello", path: "nonexistent" }, tempDir);
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("does not exist");
  });

  it("finds case-insensitive matches across files and ignores node_modules", async () => {
    const res = await executeSearchFiles({ pattern: "hello" }, tempDir);
    const parsed = JSON.parse(res);

    expect(parsed.matches_count).toBe(4);
    const files = parsed.matches.map((m: any) => m.file);
    expect(files).toContain(path.join("src", "index.ts"));
    expect(files).toContain(path.join("src", "utils.ts"));
    expect(files).toContain("README.md");

    // Must NOT contain matches from node_modules
    for (const f of files) {
      expect(f).not.toContain("node_modules");
    }
  });

  it("respects case_sensitive flag", async () => {
    const res = await executeSearchFiles(
      { pattern: "GREETING", case_sensitive: true },
      tempDir
    );
    const parsed = JSON.parse(res);

    expect(parsed.matches_count).toBe(1);
    expect(parsed.matches[0].file).toBe(path.join("src", "utils.ts"));
    expect(parsed.matches[0].line).toBe(1);
    expect(parsed.matches[0].text).toContain("export const GREETING");
  });

  it("filters by file_pattern", async () => {
    const res = await executeSearchFiles(
      { pattern: "hello", file_pattern: "*.md" },
      tempDir
    );
    const parsed = JSON.parse(res);

    expect(parsed.matches_count).toBe(1);
    expect(parsed.matches[0].file).toBe("README.md");
  });

  it("limits results and flags truncation when exceeding max_results", async () => {
    const res = await executeSearchFiles(
      { pattern: "hello", max_results: 2 },
      tempDir
    );
    const parsed = JSON.parse(res);

    expect(parsed.matches_count).toBe(2);
    expect(parsed.truncated).toBe(true);
  });

  it("searches within a specific single file target", async () => {
    const res = await executeSearchFiles(
      { pattern: "compute", path: "src/utils.ts" },
      tempDir
    );
    const parsed = JSON.parse(res);

    expect(parsed.matches_count).toBe(1);
    expect(parsed.matches[0].line).toBe(2);
    expect(parsed.matches[0].text).toContain("export function compute()");
  });
});
