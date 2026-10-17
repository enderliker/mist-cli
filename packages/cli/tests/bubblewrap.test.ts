import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  isBubblewrapAvailable,
  buildBubblewrapArgs,
  runInBubblewrap,
  validateWorkspaceDir,
} from "../src/tools/sandbox/bubblewrap.js";

describe("Bubblewrap Sandbox Engine", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bwrap-test-"));

  it("detects bubblewrap availability on Linux via probe", () => {
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

  describe("Workspace Validation", () => {
    it("rejects system root '/' as workspace", () => {
      expect(() => validateWorkspaceDir("/")).toThrow(
        "mounting the system root is forbidden for security"
      );
    });

    it("rejects user home directory as workspace", () => {
      expect(() => validateWorkspaceDir(os.homedir())).toThrow(
        "mounting the entire user home directory is forbidden for security"
      );
    });

    it("accepts valid subdirectories as workspace", () => {
      expect(validateWorkspaceDir(tempDir)).toBe(fs.realpathSync(tempDir));
    });
  });

  describe("Bubblewrap Arguments Security Invariants", () => {
    it("constructs expected arguments with new-session and ephemeral HOME", () => {
      const args = buildBubblewrapArgs("echo hello", {
        workspaceDir: tempDir,
        allowNetwork: false,
      });

      expect(args).toContain("--new-session");
      expect(args).toContain("--ro-bind");
      expect(args).toContain("/usr");
      expect(args).toContain("/proc");
      expect(args).toContain("/dev");
      expect(args).toContain("/tmp");
      expect(args).toContain("--dir");
      expect(args).toContain("/tmp/home");
      expect(args).toContain("--setenv");
      expect(args).toContain("HOME");
      expect(args).toContain("/tmp/home");
      expect(args).toContain(fs.realpathSync(tempDir));
      expect(args).toContain("--unshare-all");
      expect(args).not.toContain("--share-net");
      expect(args).toContain("--clearenv");
    });

    it("adds --share-net when allowNetwork is true", () => {
      const args = buildBubblewrapArgs("curl example.com", {
        workspaceDir: tempDir,
        allowNetwork: true,
      });

      expect(args).toContain("--unshare-all");
      expect(args).toContain("--share-net");
    });

    it("mounts .git/hooks and .git/config read-only when they exist", () => {
      const gitDir = path.join(tempDir, ".git");
      const hooksDir = path.join(gitDir, "hooks");
      const configPath = path.join(gitDir, "config");
      fs.mkdirSync(hooksDir, { recursive: true });
      fs.writeFileSync(configPath, "[core]");

      const args = buildBubblewrapArgs("echo git-test", {
        workspaceDir: tempDir,
      });

      const realHooks = fs.realpathSync(hooksDir);
      const realConfig = fs.realpathSync(configPath);

      // Verify that --ro-bind appears for hooks and config
      const hooksIdx = args.indexOf(realHooks);
      expect(hooksIdx).toBeGreaterThan(-1);
      expect(args[hooksIdx - 1]).toBe("--ro-bind");

      const configIdx = args.indexOf(realConfig);
      expect(configIdx).toBeGreaterThan(-1);
      expect(args[configIdx - 1]).toBe("--ro-bind");
    });

    it("masks .env file with /dev/null by default", () => {
      const envFile = path.join(tempDir, ".env");
      fs.writeFileSync(envFile, "SECRET=abc");

      const args = buildBubblewrapArgs("cat .env", {
        workspaceDir: tempDir,
        allowEnvSecrets: false,
      });

      const envIdx = args.indexOf(fs.realpathSync(envFile));
      expect(envIdx).toBeGreaterThan(-1);
      expect(args[envIdx - 1]).toBe("/dev/null");
      expect(args[envIdx - 2]).toBe("--ro-bind");
    });
  });

  describe("Live Execution in Bubblewrap", () => {
    it("rejects runInBubblewrap when bwrap is missing", async () => {
      await expect(
        runInBubblewrap(
          "echo hello",
          { workspaceDir: tempDir },
          "/nonexistent/bwrap"
        )
      ).rejects.toThrow("Bubblewrap sandbox engine ('bwrap') is not available or functional");
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

    it("truncates output cleanly and accurately at maxOutputBytes limit", async () => {
      if (!isBubblewrapAvailable()) return;

      // Generate 2000 bytes with limit of 100 bytes
      const res = await runInBubblewrap("yes 'abcdefghij' | head -n 200", {
        workspaceDir: tempDir,
        maxOutputBytes: 100,
      });

      expect(res.stdoutTruncated).toBe(true);
      expect(res.truncated).toBe(true);
      expect(res.stdout).toContain("[stdout truncated:");
    });
  });
});
