import { describe, it, expect, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  executeExecuteCommand,
  executeCommandToolDefinition,
} from "../src/tools/execute-command.js";
import { isBubblewrapAvailable } from "../src/tools/sandbox/bubblewrap.js";

describe("execute_command Tool", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "exec-test-"));

  it("exposes the correct tool definition schema", () => {
    expect(executeCommandToolDefinition.type).toBe("function");
    expect(executeCommandToolDefinition.function.name).toBe("execute_command");
    expect(
      executeCommandToolDefinition.function.parameters.required
    ).toContain("command");
  });

  it("validates missing or empty command", async () => {
    const res1 = await executeExecuteCommand(
      null as any,
      tempDir,
      vi.fn().mockResolvedValue(true)
    );
    expect(JSON.parse(res1).error).toContain("The 'command' argument is required");

    const res2 = await executeExecuteCommand(
      { command: "   " },
      tempDir,
      vi.fn().mockResolvedValue(true)
    );
    expect(JSON.parse(res2).error).toContain("The 'command' argument is required");
  });

  it("denies execution when onConfirm is not provided", async () => {
    if (!isBubblewrapAvailable()) return;

    const res = await executeExecuteCommand(
      { command: "echo hello" },
      tempDir
    );
    expect(JSON.parse(res).error).toContain(
      "requires explicit user confirmation"
    );
  });

  it("cancels execution when user rejects confirmation", async () => {
    if (!isBubblewrapAvailable()) return;

    const confirmMock = vi.fn().mockResolvedValue(false);
    const res = await executeExecuteCommand(
      { command: "echo hello" },
      tempDir,
      confirmMock
    );

    expect(confirmMock).toHaveBeenCalledWith(
      "execute sandboxed command 'echo hello'"
    );
    expect(JSON.parse(res).error).toContain("The user denied permission");
  });

  it("executes command in sandbox when user authorizes", async () => {
    if (!isBubblewrapAvailable()) return;

    const confirmMock = vi.fn().mockResolvedValue(true);
    const rawRes = await executeExecuteCommand(
      { command: "echo 'sandboxed execution test'" },
      tempDir,
      confirmMock
    );

    const parsed = JSON.parse(rawRes);
    expect(parsed.exit_code).toBe(0);
    expect(parsed.stdout).toContain("sandboxed execution test");
    expect(parsed.sandboxed).toBe(true);
    expect(parsed.engine).toBe("bubblewrap");
  });

  it("prevents writes outside the workspace inside sandbox", async () => {
    if (!isBubblewrapAvailable()) return;

    const confirmMock = vi.fn().mockResolvedValue(true);
    const rawRes = await executeExecuteCommand(
      { command: "touch /usr/test_fail" },
      tempDir,
      confirmMock
    );

    const parsed = JSON.parse(rawRes);
    expect(parsed.exit_code).not.toBe(0);
    expect(parsed.stderr).toContain("Read-only file system");
  });
});
