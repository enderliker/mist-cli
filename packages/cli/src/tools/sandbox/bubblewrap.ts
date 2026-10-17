import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export interface BubblewrapOptions {
  workspaceDir: string;
  allowNetwork?: boolean;
  allowEnvSecrets?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
  extraReadOnlyPaths?: string[];
}

export interface ExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  truncated: boolean;
  timedOut: boolean;
  sandboxed: boolean;
  engine: "bubblewrap";
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_BYTES = 50 * 1024;

let cachedBwrapPath: string | null = null;
let bwrapProbeSuccess: boolean | null = null;

export function findBubblewrapBinary(): string | null {
  if (process.platform !== "linux") return null;
  if (cachedBwrapPath) return cachedBwrapPath;

  const candidates = [
    "/usr/bin/bwrap",
    "/bin/bwrap",
    "/usr/local/bin/bwrap",
  ];

  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    if (dir) candidates.push(path.join(dir, "bwrap"));
  }

  for (const cand of candidates) {
    try {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        cachedBwrapPath = cand;
        return cand;
      }
    } catch {}
  }

  return null;
}

export function isBubblewrapAvailable(customBinaryPath?: string): boolean {
  if (process.platform !== "linux") return false;

  if (customBinaryPath) {
    try {
      if (!fs.existsSync(customBinaryPath)) return false;
      const probe = spawnSync(customBinaryPath, ["--ro-bind", "/", "/", "true"]);
      return probe.status === 0;
    } catch {
      return false;
    }
  }

  if (bwrapProbeSuccess !== null) return bwrapProbeSuccess;

  const bin = findBubblewrapBinary();
  if (!bin) {
    bwrapProbeSuccess = false;
    return false;
  }

  try {
    const probe = spawnSync(bin, ["--ro-bind", "/", "/", "true"]);
    bwrapProbeSuccess = probe.status === 0;
    return bwrapProbeSuccess;
  } catch {
    bwrapProbeSuccess = false;
    return false;
  }
}

export function validateWorkspaceDir(workspaceDir: string): string {
  const resolved = path.resolve(workspaceDir);
  let realPath: string;
  try {
    realPath = fs.realpathSync(resolved);
  } catch (err: any) {
    throw new Error(`Invalid workspace directory '${workspaceDir}': ${err.message}`);
  }

  const stat = fs.statSync(realPath);
  if (!stat.isDirectory()) {
    throw new Error(`Workspace path '${workspaceDir}' is not a directory.`);
  }

  let realHome: string;
  try {
    realHome = fs.realpathSync(os.homedir());
  } catch {
    realHome = os.homedir();
  }

  if (realPath === "/" || realPath === "/root") {
    throw new Error(
      `Refusing to mount '${realPath}' as workspace: mounting the system root is forbidden for security.`
    );
  }

  if (realPath === realHome) {
    throw new Error(
      `Refusing to mount '${realPath}' as workspace: mounting the entire user home directory is forbidden for security.`
    );
  }

  return realPath;
}

export function buildBubblewrapArgs(
  command: string,
  options: BubblewrapOptions
): string[] {
  const realWorkspace = validateWorkspaceDir(options.workspaceDir);
  const allowNetwork = Boolean(options.allowNetwork);

  const args: string[] = [];

  // Prevent terminal ioctl injection attacks
  args.push("--new-session");

  // Read-only system libraries and binaries (checked with existsSync)
  for (const sysPath of ["/usr", "/lib", "/lib64", "/bin"]) {
    if (fs.existsSync(sysPath)) {
      args.push("--ro-bind", sysPath, sysPath);
    }
  }

  // Node runtime support: mount Node prefix if outside /usr and /bin (nvm, fnm, volta)
  const nodeBinDir = path.dirname(process.execPath);
  const extraPaths = options.extraReadOnlyPaths ? [...options.extraReadOnlyPaths] : [];

  if (!nodeBinDir.startsWith("/usr") && !nodeBinDir.startsWith("/bin")) {
    const nodePrefix = path.resolve(nodeBinDir, "..");
    if (fs.existsSync(nodePrefix) && !extraPaths.includes(nodePrefix)) {
      extraPaths.push(nodePrefix);
    }
  }

  for (const extra of extraPaths) {
    if (fs.existsSync(extra)) {
      args.push("--ro-bind", extra, extra);
    }
  }

  // Minimal /etc dependencies for git, Node userInfo, DNS and TLS
  const etcFiles = [
    "/etc/resolv.conf",
    "/etc/hosts",
    "/etc/nsswitch.conf",
    "/etc/passwd",
    "/etc/group",
    "/etc/ssl",
    "/etc/pki",
    "/etc/alternatives",
  ];

  for (const etc of etcFiles) {
    if (fs.existsSync(etc)) {
      args.push("--ro-bind", etc, etc);
    }
  }

  // Core virtual filesystems and ephemeral home
  args.push("--proc", "/proc");
  args.push("--dev", "/dev");
  args.push("--tmpfs", "/tmp");
  args.push("--dir", "/tmp/home");

  // Mount workspace read-write
  args.push("--bind", realWorkspace, realWorkspace);
  args.push("--chdir", realWorkspace);

  // Protect git hooks and git config from deferred escape attacks
  for (const gitSub of [".git/hooks", ".git/config"]) {
    const fullGitPath = path.join(realWorkspace, gitSub);
    if (fs.existsSync(fullGitPath)) {
      args.push("--ro-bind", fullGitPath, fullGitPath);
    }
  }

  // Mask sensitive .env file inside workspace unless explicitly permitted
  if (!options.allowEnvSecrets) {
    const envFile = path.join(realWorkspace, ".env");
    if (fs.existsSync(envFile)) {
      args.push("--ro-bind", "/dev/null", envFile);
    }
  }

  // Namespace isolation
  args.push("--unshare-all");
  if (allowNetwork) {
    args.push("--share-net");
  }

  // Clean environment and set isolated variables
  args.push("--clearenv");

  const pathCandidates = [
    nodeBinDir,
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const finalPath = Array.from(new Set(pathCandidates.filter((d) => fs.existsSync(d)))).join(":");
  args.push("--setenv", "PATH", finalPath);
  args.push("--setenv", "HOME", "/tmp/home");
  args.push("--setenv", "TERM", "xterm-256color");

  args.push("--die-with-parent");

  // Apply resource limits before executing shell command
  const limitedCommand = `ulimit -u 512 2>/dev/null || true; ulimit -v 4194304 2>/dev/null || true; ulimit -n 4096 2>/dev/null || true; ${command}`;
  args.push("--", "/bin/sh", "-c", limitedCommand);

  return args;
}

export function runInBubblewrap(
  command: string,
  options: BubblewrapOptions,
  customBwrapPath?: string
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    const bwrapBinary = customBwrapPath || findBubblewrapBinary();

    if (!bwrapBinary || !isBubblewrapAvailable(bwrapBinary)) {
      return reject(
        new Error(
          "Bubblewrap sandbox engine ('bwrap') is not available or functional on this system."
        )
      );
    }

    let args: string[];
    try {
      args = buildBubblewrapArgs(command, options);
    } catch (err) {
      return reject(err);
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
    const killThreshold = maxBytes * 2;

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let killedByOutputLimit = false;

    let timer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;

    const child = spawn(bwrapBinary, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
        }, 1000);
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutBytes < maxBytes) {
        const remaining = maxBytes - stdoutBytes;
        if (chunk.length <= remaining) {
          stdoutChunks.push(chunk);
          stdoutBytes += chunk.length;
        } else {
          stdoutChunks.push(chunk.subarray(0, remaining));
          stdoutBytes += remaining;
          stdoutTruncated = true;
        }
      } else {
        stdoutTruncated = true;
      }

      if (stdoutBytes + chunk.length > killThreshold && !killedByOutputLimit) {
        killedByOutputLimit = true;
        child.kill("SIGTERM");
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrBytes < maxBytes) {
        const remaining = maxBytes - stderrBytes;
        if (chunk.length <= remaining) {
          stderrChunks.push(chunk);
          stderrBytes += chunk.length;
        } else {
          stderrChunks.push(chunk.subarray(0, remaining));
          stderrBytes += remaining;
          stderrTruncated = true;
        }
      } else {
        stderrTruncated = true;
      }

      if (stderrBytes + chunk.length > killThreshold && !killedByOutputLimit) {
        killedByOutputLimit = true;
        child.kill("SIGTERM");
      }
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);

      let stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      let stderr = Buffer.concat(stderrChunks).toString("utf-8");
      const limitKb = Math.round(maxBytes / 1024);

      if (stdoutTruncated) {
        stdout += `\n...[stdout truncated: reached ${limitKb} KB safety limit]`;
      }
      if (stderrTruncated) {
        stderr += `\n...[stderr truncated: reached ${limitKb} KB safety limit]`;
      }

      const truncated = stdoutTruncated || stderrTruncated;

      resolve({
        exitCode: timedOut ? 124 : code,
        stdout,
        stderr,
        stdoutTruncated,
        stderrTruncated,
        truncated,
        timedOut,
        sandboxed: true,
        engine: "bubblewrap",
      });
    });
  });
}
