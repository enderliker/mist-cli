import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeWriteFile, writeFileToolDefinition } from "../src/tools/write-file.js";
import { executeTool, getAllToolDefinitions } from "../src/tools/index.js";

describe("Tool: write_file", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mistral-cli-write-test-"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("registers tool definition with Mistral schema", () => {
    expect(writeFileToolDefinition.type).toBe("function");
    expect(writeFileToolDefinition.function.name).toBe("write_file");
    expect(writeFileToolDefinition.function.parameters.required).toContain("path");
    expect(writeFileToolDefinition.function.parameters.required).toContain("content");
  });

  it("creates a new file with specified content", async () => {
    const rawResult = await executeWriteFile(
      { path: "new-file.txt", content: "Hello from Codestral!" },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.file).toBe("new-file.txt");
    expect(result.success).toBe(true);

    const writtenContent = fs.readFileSync(path.join(tempDir, "new-file.txt"), "utf-8");
    expect(writtenContent).toBe("Hello from Codestral!");
  });

  it("creates intermediate directories if they do not exist", async () => {
    const rawResult = await executeWriteFile(
      { path: "src/utils/math.ts", content: "export const add = (a: number, b: number) => a + b;" },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "src", "utils", "math.ts"))).toBe(true);
  });

  it("overwrites an existing file when overwrite is true or default", async () => {
    await executeWriteFile({ path: "config.json", content: "{\"version\": 1}" }, tempDir);
    const rawResult = await executeWriteFile({ path: "config.json", content: "{\"version\": 2}" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.success).toBe(true);
    const updated = fs.readFileSync(path.join(tempDir, "config.json"), "utf-8");
    expect(updated).toBe("{\"version\": 2}");
  });

  it("does not overwrite if overwrite is false and file exists", async () => {
    await executeWriteFile({ path: "locked.txt", content: "Original" }, tempDir);
    const rawResult = await executeWriteFile(
      { path: "locked.txt", content: "Modified", overwrite: false },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/already exists.*overwrite=false/i);
    const current = fs.readFileSync(path.join(tempDir, "locked.txt"), "utf-8");
    expect(current).toBe("Original");
  });

  it("blocks path traversal outside the workspace", async () => {
    const rawResult = await executeWriteFile(
      { path: "../malicious.txt", content: "Attack" },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/Access denied.*outside the allowed workspace/i);
  });

  it("fails if target path is an existing directory", async () => {
    fs.mkdirSync(path.join(tempDir, "existing_dir"));
    const rawResult = await executeWriteFile(
      { path: "existing_dir", content: "Text" },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/is an existing directory/i);
  });

  it("is registered in global tool registry", async () => {
    const tools = getAllToolDefinitions();
    const writeTool = tools.find((t) => t.function.name === "write_file");
    expect(writeTool).toBeDefined();

    const rawResult = await executeTool(
      "write_file",
      { path: "via-registry.txt", content: "Test content from registry" },
      tempDir
    );
    const result = JSON.parse(rawResult);
    expect(result.success).toBe(true);
  });

  it("blocks writing to sensitive files when no confirm callback is provided", async () => {
    const rawResult = await executeWriteFile(
      { path: ".env", content: "SECRET=123" },
      tempDir
    );
    const result = JSON.parse(rawResult);
    expect(result.error).toMatch(/Access denied.*sensitive file.*requires interactive confirmation/i);
    expect(fs.existsSync(path.join(tempDir, ".env"))).toBe(false);
  });

  it("cancels writing to sensitive files when user denies permission", async () => {
    const onConfirm = vi.fn().mockResolvedValue(false);
    const rawResult = await executeWriteFile(
      { path: "id_rsa", content: "PRIVATE KEY" },
      tempDir,
      onConfirm
    );
    const result = JSON.parse(rawResult);
    expect(onConfirm).toHaveBeenCalled();
    expect(result.error).toMatch(/User denied permission.*sensitive file/i);
    expect(fs.existsSync(path.join(tempDir, "id_rsa"))).toBe(false);
  });

  it("allows writing to sensitive files when user grants permission", async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    const rawResult = await executeWriteFile(
      { path: ".env.production", content: "API_KEY=prod-secret" },
      tempDir,
      onConfirm
    );
    const result = JSON.parse(rawResult);
    expect(onConfirm).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, ".env.production"), "utf-8")).toBe("API_KEY=prod-secret");
  });
});
