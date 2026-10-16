import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  isBubblewrapAvailable,
  buildBubblewrapArgs,
  runInBubblewrap,
} from "../src/tools/sandbox/bubblewrap.js";

describe("Bubblewrap Sandbox Engine", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bwrap-test-"));

  it("detects bubblewrap availability on Linux", () => {
    const available = isBubblewrapAvailable();
    if (process.platform === "linux") {
      expect(available).toBe(true);
    } else {
      expect(available).toBe(false);
    }
  });

  it("returns false for nonexistent binary path", () => {
    expect(isBubblewrapAvailable("/path/to/nonexistent/bwrap")).toBe(false);
  });

  it("constructs expected bubblewrap arguments", () => {
    const args = buildBubblewrapArgs("echo hello", {
      workspaceDir: tempDir,
      allowNetwork: false,
    });

    expect(args).toContain("--ro-bind");
    expect(args).toContain("/usr");
    expect(args).toContain("/proc");
    expect(args).toContain("/dev");
    expect(args).toContain("/tmp");
    expect(args).toContain(tempDir);
    expect(args).toContain("--unshare-all");
    expect(args).not.toContain("--share-net");
    expect(args).toContain("echo hello");
  });

  it("adds --share-net when allowNetwork is true", () => {
    const args = buildBubblewrapArgs("curl example.com", {
      workspaceDir: tempDir,
      allowNetwork: true,
    });

    expect(args).toContain("--unshare-all");
    expect(args).toContain("--share-net");
  });

  it("rejects runInBubblewrap when bwrap is missing", async () => {
    await expect(
      runInBubblewrap(
        "echo hello",
        { workspaceDir: tempDir },
        "/nonexistent/bwrap"
      )
    ).rejects.toThrow("Bubblewrap sandbox engine ('bwrap') is not available");
  });

  it("executes basic commands inside the live bubblewrap sandbox", async () => {
    if (!isBubblewrapAvailable()) return;

    const res = await runInBubblewrap("echo 'hello from sandbox'", {
      workspaceDir: tempDir,
    });

    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("hello from sandbox");
    expect(res.sandboxed).toBe(true);
    expect(res.engine).toBe("bubblewrap");
    expect(res.timedOut).toBe(false);
  });

  it("isolates filesystem outside the workspace directory", async () => {
    if (!isBubblewrapAvailable()) return;

    // Writing outside the workspace (e.g. into root / or /usr) must fail with Permission denied
    const res = await runInBubblewrap("touch /usr/forbidden_test_file", {
      workspaceDir: tempDir,
    });

    expect(res.exitCode).not.toBe(0);
    expect(res.stderr).toContain("Read-only file system");
  });

  it("terminates commands that exceed timeout", async () => {
    if (!isBubblewrapAvailable()) return;

    const res = await runInBubblewrap("sleep 3", {
      workspaceDir: tempDir,
      timeoutMs: 200,
    });

    expect(res.timedOut).toBe(true);
  });
});
