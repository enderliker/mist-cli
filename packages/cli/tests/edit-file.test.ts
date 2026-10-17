import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  editFileToolDefinition,
  executeEditFile,
} from "../src/tools/edit-file.js";

describe("edit_file Tool", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "edit-test-"));
    fs.writeFileSync(
      path.join(tempDir, "sample.ts"),
      `function greet(name: string) {\n  console.log("Hello, " + name);\n  return true;\n}\n`
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("exposes the correct tool definition schema", () => {
    expect(editFileToolDefinition.type).toBe("function");
    expect(editFileToolDefinition.function.name).toBe("edit_file");
    expect(editFileToolDefinition.function.parameters.required).toContain("path");
    expect(editFileToolDefinition.function.parameters.required).toContain("target_content");
    expect(editFileToolDefinition.function.parameters.required).toContain("replacement_content");
  });

  it("returns error for missing required arguments", async () => {
    const res = await executeEditFile(
      { path: "", target_content: "foo", replacement_content: "bar" },
      tempDir
    );
    expect(JSON.parse(res).error).toContain("Missing required argument 'path'");

    const res2 = await executeEditFile(
      { path: "sample.ts", target_content: "", replacement_content: "bar" } as any,
      tempDir
    );
    // target_content is empty string, which won't be found
    expect(JSON.parse(res2).error).toContain("Target content not found");
  });

  it("rejects path traversal outside workspace", async () => {
    const res = await executeEditFile(
      {
        path: "../outside.txt",
        target_content: "a",
        replacement_content: "b",
      },
      tempDir
    );
    expect(JSON.parse(res).error).toContain("outside the allowed workspace");
  });

  it("rejects non-existent file", async () => {
    const res = await executeEditFile(
      {
        path: "does_not_exist.ts",
        target_content: "foo",
        replacement_content: "bar",
      },
      tempDir
    );
    expect(JSON.parse(res).error).toContain("does not exist");
  });

  it("rejects when target_content is not found in file", async () => {
    const res = await executeEditFile(
      {
        path: "sample.ts",
        target_content: "function nonexistent()",
        replacement_content: "function replacement()",
      },
      tempDir
    );
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("Target content not found");
  });

  it("rejects ambiguous matches when target appears multiple times", async () => {
    fs.writeFileSync(path.join(tempDir, "dup.txt"), "repeat\nrepeat\nrepeat\n");

    const res = await executeEditFile(
      {
        path: "dup.txt",
        target_content: "repeat",
        replacement_content: "replaced",
      },
      tempDir
    );
    const parsed = JSON.parse(res);
    expect(parsed.error).toContain("Ambiguous match: Target content was found 3 time(s)");
  });

  it("replaces exact unique target content surgically", async () => {
    const target = 'console.log("Hello, " + name);';
    const replacement = 'console.log(`Hello, ${name}!`);';

    const res = await executeEditFile(
      {
        path: "sample.ts",
        target_content: target,
        replacement_content: replacement,
      },
      tempDir
    );

    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(true);
    expect(parsed.replacements).toBe(1);

    const updated = fs.readFileSync(path.join(tempDir, "sample.ts"), "utf-8");
    expect(updated).toContain(replacement);
    expect(updated).not.toContain(target);
    expect(updated).toContain("function greet(name: string)");
    expect(updated).toContain("return true;");
  });

  it("allows multiple replacements when expected_matches is explicitly specified", async () => {
    fs.writeFileSync(path.join(tempDir, "multi.txt"), "val=1;\nval=2;\n");

    const res = await executeEditFile(
      {
        path: "multi.txt",
        target_content: "val=",
        replacement_content: "const val=",
        expected_matches: 2,
      },
      tempDir
    );

    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(true);
    expect(parsed.replacements).toBe(2);

    const updated = fs.readFileSync(path.join(tempDir, "multi.txt"), "utf-8");
    expect(updated).toBe("const val=1;\nconst val=2;\n");
  });

  it("requires confirmation when editing sensitive files (.env)", async () => {
    fs.writeFileSync(path.join(tempDir, ".env"), "API_KEY=secret123\n");

    // Denied when no confirmation callback
    const resNoConfirm = await executeEditFile(
      {
        path: ".env",
        target_content: "secret123",
        replacement_content: "secret456",
      },
      tempDir
    );
    expect(JSON.parse(resNoConfirm).error).toContain("requires interactive confirmation");

    // Denied when user declines
    const onConfirmDenied = vi.fn().mockResolvedValue(false);
    const resDenied = await executeEditFile(
      {
        path: ".env",
        target_content: "secret123",
        replacement_content: "secret456",
      },
      tempDir,
      onConfirmDenied
    );
    expect(JSON.parse(resDenied).error).toContain("User denied permission");

    // Allowed when authorized
    const onConfirmApproved = vi.fn().mockResolvedValue(true);
    const resApproved = await executeEditFile(
      {
        path: ".env",
        target_content: "secret123",
        replacement_content: "secret456",
      },
      tempDir,
      onConfirmApproved
    );
    expect(JSON.parse(resApproved).success).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, ".env"), "utf-8")).toBe("API_KEY=secret456\n");
  });
});
