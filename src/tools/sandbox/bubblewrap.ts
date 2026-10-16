import fs from "node:fs";
import { spawn } from "node:child_process";

export interface BubblewrapOptions {
  workspaceDir: string;
  allowNetwork?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  sandboxed: boolean;
  engine: "bubblewrap";
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_BYTES = 50 * 1024;

export function isBubblewrapAvailable(customBinaryPath?: string): boolean {
  if (process.platform !== "linux") return false;
  const binary = customBinaryPath || "/usr/bin/bwrap";
  try {
    return fs.existsSync(binary);
  } catch {
    return false;
  }
}

export function buildBubblewrapArgs(
  command: string,
  options: BubblewrapOptions
): string[] {
  const { workspaceDir, allowNetwork = false } = options;
  const args: string[] = [
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/lib",
    "/lib",
  ];

  if (fs.existsSync("/lib64")) {
    args.push("--ro-bind", "/lib64", "/lib64");
  }

  if (fs.existsSync("/bin")) {
    args.push("--ro-bind", "/bin", "/bin");
  }

  if (fs.existsSync("/etc/resolv.conf")) {
    args.push("--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf");
  }

  if (fs.existsSync("/etc/ssl")) {
    args.push("--ro-bind", "/etc/ssl", "/etc/ssl");
  }

  if (fs.existsSync("/etc/alternatives")) {
    args.push("--ro-bind", "/etc/alternatives", "/etc/alternatives");
  }

  args.push("--proc", "/proc");
  args.push("--dev", "/dev");
  args.push("--tmpfs", "/tmp");

  args.push("--bind", workspaceDir, workspaceDir);
  args.push("--chdir", workspaceDir);

  args.push("--unshare-all");
  if (allowNetwork) {
    args.push("--share-net");
  }

  args.push("--die-with-parent");
  args.push("--", "/bin/sh", "-c", command);

  return args;
}

export function runInBubblewrap(
  command: string,
  options: BubblewrapOptions,
  customBwrapPath = "/usr/bin/bwrap"
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    if (!isBubblewrapAvailable(customBwrapPath)) {
      return reject(
        new Error(
          "Bubblewrap sandbox engine ('bwrap') is not available on this system."
        )
      );
    }

    const args = buildBubblewrapArgs(command, options);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;

    const child = spawn(customBwrapPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        HOME: options.workspaceDir,
        TERM: "xterm-256color",
        NODE_ENV: process.env.NODE_ENV || "test",
      },
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 1000);
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutBytes < maxBytes) {
        stdoutChunks.push(chunk);
        stdoutBytes += chunk.length;
      } else {
        truncated = true;
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrBytes < maxBytes) {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      } else {
        truncated = true;
      }
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);

      let stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");

      if (truncated) {
        stdout += "\n...[Output truncated: reached 50 KB safety limit]";
      }

      resolve({
        exitCode: timedOut ? 124 : code,
        stdout,
        stderr,
        truncated,
        timedOut,
        sandboxed: true,
        engine: "bubblewrap",
      });
    });
  });
}
