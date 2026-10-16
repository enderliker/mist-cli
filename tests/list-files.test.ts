import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeListFiles, listFilesToolDefinition } from "../src/tools/list-files.js";
import { executeTool, getAllToolDefinitions } from "../src/tools/index.js";

describe("Tool: list_files", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mistral-cli-list-test-"));
    fs.writeFileSync(path.join(tempDir, "file1.txt"), "Hello");
    fs.writeFileSync(path.join(tempDir, "file2.ts"), "const x = 1;");
    fs.mkdirSync(path.join(tempDir, "subfolder"));
    fs.writeFileSync(path.join(tempDir, "subfolder", "nested.txt"), "Nested");

    fs.mkdirSync(path.join(tempDir, "node_modules"));
    fs.writeFileSync(path.join(tempDir, "node_modules", "ignore.js"), "// ignore");
    fs.mkdirSync(path.join(tempDir, ".git"));
    fs.writeFileSync(path.join(tempDir, ".git", "config"), "git config");
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("registers tool definition with Mistral schema", () => {
    expect(listFilesToolDefinition.type).toBe("function");
    expect(listFilesToolDefinition.function.name).toBe("list_files");
    expect(listFilesToolDefinition.function.parameters).toBeDefined();
  });

  it("lists workspace root entries ignoring node_modules and .git", async () => {
    const rawResult = await executeListFiles({ path: "." }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.path).toBe(".");
    expect(Array.isArray(result.entries)).toBe(true);

    const names = result.entries.map((e: { name: string }) => e.name);
    expect(names).toContain("file1.txt");
    expect(names).toContain("file2.ts");
    expect(names).toContain("subfolder");
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain(".git");
  });

  it("supports listing specific subdirectories", async () => {
    const rawResult = await executeListFiles({ path: "subfolder" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.path).toBe("subfolder");
    const names = result.entries.map((e: { name: string }) => e.name);
    expect(names).toContain("nested.txt");
  });

  it("blocks path traversal outside the workspace", async () => {
    const rawResult = await executeListFiles({ path: "../.." }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/Access denied.*outside the allowed workspace/i);
  });

  it("returns error if directory does not exist", async () => {
    const rawResult = await executeListFiles({ path: "nonexistent_folder" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/does not exist in the workspace/i);
  });

  it("returns error if target is a file instead of a directory", async () => {
    const rawResult = await executeListFiles({ path: "file1.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/is a file, not a directory/i);
  });

  it("is registered in global tool registry", async () => {
    const tools = getAllToolDefinitions();
    const listTool = tools.find((t) => t.function.name === "list_files");
    expect(listTool).toBeDefined();

    const rawResult = await executeTool("list_files", { path: "." }, tempDir);
    const result = JSON.parse(rawResult);
    expect(result.entries).toBeDefined();
  });
});
