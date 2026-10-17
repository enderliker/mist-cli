import fs from "node:fs";
import path from "node:path";
import { MistralTool, ToolExecutor, ConfirmCallback } from "./types.js";

export interface ReadFileArgs {
  path: string;
  start_line?: number;
  end_line?: number;
}

export const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100 KB limit for context safety

export const readFileToolDefinition: MistralTool = {
  type: "function",
  function: {
    name: "read_file",
    description:
      "Reads the content of a text file in the workspace. Supports reading full files or specific line ranges.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path of the file to read within the workspace.",
        },
        start_line: {
          type: "integer",
          description: "Starting line number (1-indexed, optional).",
        },
        end_line: {
          type: "integer",
          description: "Ending line number (1-indexed, optional).",
        },
      },
      required: ["path"],
    },
  },
};

export function isPathInside(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, targetPath);

  const lexicalRelative = path.relative(resolvedBase, resolvedTarget);
  if (lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) {
    return false;
  }

  let realBase = resolvedBase;
  try {
    realBase = fs.realpathSync(resolvedBase);
  } catch {}

  try {
    const realTarget = fs.realpathSync(resolvedTarget);
    const realRelative = path.relative(realBase, realTarget);
    return !realRelative.startsWith("..") && !path.isAbsolute(realRelative);
  } catch (err: any) {
    if (err && err.code === "ENOENT") {
      let currentDir = path.dirname(resolvedTarget);
      while (currentDir && currentDir !== path.dirname(currentDir)) {
        try {
          if (fs.existsSync(currentDir)) {
            const realParent = fs.realpathSync(currentDir);
            const parentRelative = path.relative(realBase, realParent);
            if (parentRelative.startsWith("..") || path.isAbsolute(parentRelative)) {
              return false;
            }
            break;
          }
        } catch {
          return false;
        }
        currentDir = path.dirname(currentDir);
      }
      return true;
    }
    return false;
  }
}

export function isSensitiveFile(filePath: string, workspaceDir?: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (base.endsWith(".pem") || base.endsWith(".key") || base.startsWith("id_rsa")) return true;

  if (workspaceDir) {
    try {
      const resolved = path.resolve(workspaceDir, filePath);
      if (fs.existsSync(resolved)) {
        const real = fs.realpathSync(resolved);
        const realBase = path.basename(real).toLowerCase();
        if (realBase === ".env" || realBase.startsWith(".env.")) return true;
        if (realBase.endsWith(".pem") || realBase.endsWith(".key") || realBase.startsWith("id_rsa")) return true;
      }
    } catch {}
  }

  return false;
}

export async function executeReadFile(
  args: ReadFileArgs,
  workspaceDir: string = process.cwd(),
  onConfirmSensitive?: ConfirmCallback
): Promise<string> {
  if (!args || typeof args.path !== "string" || args.path.trim() === "") {
    return JSON.stringify({
      error: "The 'path' argument is required and must be a valid string.",
    });
  }

  const rawPath = args.path.trim();
  const resolvedBase = path.resolve(workspaceDir);
  const resolvedPath = path.resolve(resolvedBase, rawPath);

  if (!isPathInside(resolvedBase, resolvedPath)) {
    return JSON.stringify({
      error: `Access denied: Path '${rawPath}' is outside the allowed workspace.`,
    });
  }

  if (!fs.existsSync(resolvedPath)) {
    return JSON.stringify({
      error: `File '${rawPath}' does not exist in the workspace.`,
    });
  }

  if (isSensitiveFile(rawPath, resolvedBase)) {
    if (!onConfirmSensitive) {
      return JSON.stringify({
        error: `Access denied: '${rawPath}' is a sensitive file and requires explicit user confirmation.`,
      });
    }

    const allowed = await onConfirmSensitive(`read sensitive file '${rawPath}'`);
    if (!allowed) {
      return JSON.stringify({
        error: `Read cancelled: The user denied access to sensitive file '${rawPath}'.`,
      });
    }
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.isDirectory()) {
    return JSON.stringify({
      error: `'${rawPath}' is a directory, not a text file.`,
    });
  }

  if (stats.size > MAX_FILE_SIZE_BYTES && !args.start_line && !args.end_line) {
    return JSON.stringify({
      error: `File '${rawPath}' is too large (${(stats.size / 1024).toFixed(
        1
      )} KB > ${MAX_FILE_SIZE_BYTES / 1024} KB). Specify 'start_line' and 'end_line' to read specific chunks.`,
    });
  }

  try {
    const rawContent = fs.readFileSync(resolvedPath, "utf-8");
    const lines = rawContent.split(/\r?\n/);
    const totalLines = lines.length;

    let start = 1;
    let end = totalLines;

    if (typeof args.start_line === "number" && args.start_line > 0) {
      start = Math.min(args.start_line, totalLines);
    }
    if (typeof args.end_line === "number" && args.end_line >= start) {
      end = Math.min(args.end_line, totalLines);
    }

    const selectedLines = lines.slice(start - 1, end);
    const content = selectedLines.join("\n");

    return JSON.stringify({
      file: rawPath,
      total_lines: totalLines,
      displayed_range: [start, end],
      content,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      error: `Error reading file '${rawPath}': ${message}`,
    });
  }
}

export const readFileToolExecutor: ToolExecutor<ReadFileArgs> = {
  definition: readFileToolDefinition,
  execute: executeReadFile,
};
