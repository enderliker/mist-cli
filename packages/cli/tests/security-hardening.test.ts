import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { executeReadFile, isPathInside, isSensitiveFile } from "../src/tools/read-file.js";
import { executeWriteFile } from "../src/tools/write-file.js";
import { executeListFiles } from "../src/tools/list-files.js";
import { runInBubblewrap, isBubblewrapAvailable } from "../src/tools/sandbox/bubblewrap.js";

describe("Security & Hardening Guardrails", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sec-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Symlink Traversal Prevention", () => {
    it("rejects read_file on symlink pointing outside the workspace", async () => {
      const symlinkPath = path.join(tempDir, "link_to_hosts");
      try {
        fs.symlinkSync("/etc/hosts", symlinkPath);
      } catch {
        // Skip on environments where symlink creation is restricted
        return;
      }

      const res = await executeReadFile({ path: "link_to_hosts" }, tempDir);
      const parsed = JSON.parse(res);

      expect(parsed.error).toContain("Access denied: Path 'link_to_hosts' is outside the allowed workspace.");
    });

    it("rejects write_file on existing symbolic links", async () => {
      const realFile = path.join(tempDir, "target.txt");
      fs.writeFileSync(realFile, "initial content");
      const symlinkPath = path.join(tempDir, "link_target");

      try {
        fs.symlinkSync(realFile, symlinkPath);
      } catch {
        return;
      }

      const res = await executeWriteFile(
        { path: "link_target", content: "overwritten" },
        tempDir
      );
      const parsed = JSON.parse(res);

      expect(parsed.error).toContain("Writing to or overwriting symbolic links is prohibited");
      expect(fs.readFileSync(realFile, "utf-8")).toBe("initial content");
    });

    it("detects sensitive files referenced through symbolic links", async () => {
      const envFile = path.join(tempDir, ".env");
      fs.writeFileSync(envFile, "SECRET=12345");
      const symlinkPath = path.join(tempDir, "benign_looking_link.txt");

      try {
        fs.symlinkSync(envFile, symlinkPath);
      } catch {
        return;
      }

      expect(isSensitiveFile("benign_looking_link.txt", tempDir)).toBe(true);

      const confirmMock = vi.fn().mockResolvedValue(false);
      const res = await executeReadFile(
        { path: "benign_looking_link.txt" },
        tempDir,
        confirmMock
      );
      const parsed = JSON.parse(res);

      expect(confirmMock).toHaveBeenCalled();
      expect(parsed.error).toContain("The user denied access to sensitive file");
    });

    it("rejects list_files on directory symlinks pointing outside workspace", async () => {
      const symlinkDir = path.join(tempDir, "link_to_etc");
      try {
        fs.symlinkSync("/etc", symlinkDir);
      } catch {
        return;
      }

      const res = await executeListFiles({ path: "link_to_etc" }, tempDir);
      const parsed = JSON.parse(res);

      expect(parsed.error).toContain("Access denied: Path 'link_to_etc' is outside the allowed workspace.");
    });
  });

  describe("Sandbox Process & Environment Isolation", () => {
    it("clears ambient host environment variables via --clearenv", async () => {
      if (!isBubblewrapAvailable()) return;

      process.env.TEST_HOST_SECRET_VAR = "super_secret_value";

      const res = await runInBubblewrap("env", { workspaceDir: tempDir });

      delete process.env.TEST_HOST_SECRET_VAR;

      expect(res.exitCode).toBe(0);
      expect(res.stdout).not.toContain("TEST_HOST_SECRET_VAR");
      expect(res.stdout).not.toContain("super_secret_value");
    });
  });
});
