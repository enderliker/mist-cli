import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeReadFile, isPathInside, MAX_FILE_SIZE_BYTES } from "../src/tools/read-file.js";
import { executeTool, getAllToolDefinitions } from "../src/tools/index.js";

describe("Tool: read_file", () => {
  let tempDir: string;
  let testFile: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mistral-cli-test-"));
    testFile = path.join(tempDir, "sample.txt");
    fs.writeFileSync(
      testFile,
      "Line 1: Hello World\nLine 2: Second line\nLine 3: Third line\nLine 4: Fourth line\nLine 5: End"
    );
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("registers tool definition with Mistral schema", () => {
    const tools = getAllToolDefinitions();
    expect(tools.length).toBeGreaterThan(0);
    const readTool = tools.find((t) => t.function.name === "read_file");
    expect(readTool).toBeDefined();
    expect(readTool?.function.parameters).toHaveProperty("required");
  });

  it("reads an entire file correctly", async () => {
    const rawResult = await executeReadFile({ path: "sample.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.file).toBe("sample.txt");
    expect(result.total_lines).toBe(5);
    expect(result.displayed_range).toEqual([1, 5]);
    expect(result.content).toContain("Line 1: Hello World");
    expect(result.content).toContain("Line 5: End");
  });

  it("supports reading a specific line range", async () => {
    const rawResult = await executeReadFile(
      { path: "sample.txt", start_line: 2, end_line: 4 },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.displayed_range).toEqual([2, 4]);
    expect(result.content).toBe("Line 2: Second line\nLine 3: Third line\nLine 4: Fourth line");
  });

  it("blocks path traversal outside the workspace", async () => {
    const rawResult = await executeReadFile({ path: "../../etc/passwd" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/Access denied.*outside the allowed workspace/i);
  });

  it("returns a clear error if the file does not exist", async () => {
    const rawResult = await executeReadFile({ path: "nonexistent.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/does not exist in the workspace/i);
  });

  it("returns an error if the target is a directory", async () => {
    const rawResult = await executeReadFile({ path: "." }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/is a directory/i);
  });

  it("warns about files exceeding size limit without a line range", async () => {
    const largeFile = path.join(tempDir, "large.txt");
    const largeContent = "A".repeat(MAX_FILE_SIZE_BYTES + 2048);
    fs.writeFileSync(largeFile, largeContent);

    const rawResult = await executeReadFile({ path: "large.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/too large/i);
  });

  it("allows reading through executeTool registry", async () => {
    const rawResult = await executeTool("read_file", { path: "sample.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.file).toBe("sample.txt");
  });

  it("returns error if unregistered tool is executed", async () => {
    const rawResult = await executeTool("invalid_tool", {}, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/not registered/i);
  });

  it("detects sensitive files such as .env, .pem, .key", async () => {
    const { isSensitiveFile } = await import("../src/tools/read-file.js");
    expect(isSensitiveFile(".env")).toBe(true);
    expect(isSensitiveFile(".env.local")).toBe(true);
    expect(isSensitiveFile("server.key")).toBe(true);
    expect(isSensitiveFile("cert.pem")).toBe(true);
    expect(isSensitiveFile("id_rsa")).toBe(true);
    expect(isSensitiveFile("package.json")).toBe(false);
    expect(isSensitiveFile("src/index.ts")).toBe(false);
  });

  it("blocks reading sensitive files by default when no confirmation handler exists", async () => {
    fs.writeFileSync(path.join(tempDir, ".env"), "SECRET=123");
    const rawResult = await executeReadFile({ path: ".env" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/sensitive file.*requires explicit user confirmation/i);
  });

  it("allows reading sensitive file when confirmed by user", async () => {
    fs.writeFileSync(path.join(tempDir, ".env"), "SECRET=123");
    const rawResult = await executeReadFile(
      { path: ".env" },
      tempDir,
      async () => true
    );
    const result = JSON.parse(rawResult);

    expect(result.content).toBe("SECRET=123");
  });

  it("cancels sensitive file read when user denies access", async () => {
    fs.writeFileSync(path.join(tempDir, ".env"), "SECRET=123");
    const rawResult = await executeReadFile(
      { path: ".env" },
      tempDir,
      async () => false
    );
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/user denied access/i);
  });
});
