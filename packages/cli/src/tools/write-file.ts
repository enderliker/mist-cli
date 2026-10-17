import fs from "node:fs";
import path from "node:path";
import { MistralTool, ToolExecutor, ConfirmCallback } from "./types.js";
import { isPathInside, isSensitiveFile } from "./read-file.js";

export interface WriteFileArgs {
  path: string;
  content: string;
  overwrite?: boolean;
}

export const writeFileToolDefinition: MistralTool = {
  type: "function",
  function: {
    name: "write_file",
    description:
      "Creates or overwrites a file in the workspace with provided content. Automatically creates intermediate directories if needed.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path to create or overwrite in the workspace.",
        },
        content: {
          type: "string",
          description: "Textual content to write into the file.",
        },
        overwrite: {
          type: "boolean",
          description: "Whether to overwrite the file if it already exists (defaults to true).",
        },
      },
      required: ["path", "content"],
    },
  },
};

export async function executeWriteFile(
  args: WriteFileArgs,
  workspaceDir: string = process.cwd(),
  onConfirm?: ConfirmCallback
): Promise<string> {
  if (!args || typeof args.path !== "string" || args.path.trim() === "") {
    return JSON.stringify({
      error: "The 'path' argument is required and must be a valid string.",
    });
  }

  if (typeof args.content !== "string") {
    return JSON.stringify({
      error: "The 'content' argument is required and must be a string.",
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

  if (isSensitiveFile(rawPath, resolvedBase)) {
    if (!onConfirm) {
      return JSON.stringify({
        error: `Access denied: Writing to sensitive file '${rawPath}' requires interactive confirmation.`,
      });
    }

    const allowed = await onConfirm(`write to sensitive file '${rawPath}'`);
    if (!allowed) {
      return JSON.stringify({
        error: `Write cancelled: User denied permission to write to sensitive file '${rawPath}'.`,
      });
    }
  }

  try {
    const lstat = fs.lstatSync(resolvedPath);
    if (lstat.isSymbolicLink()) {
      return JSON.stringify({
        error: `Access denied: Writing to or overwriting symbolic links is prohibited for security. '${rawPath}' is a symbolic link.`,
      });
    }
  } catch {}

  if (fs.existsSync(resolvedPath)) {
    const stats = fs.statSync(resolvedPath);
    if (stats.isDirectory()) {
      return JSON.stringify({
        error: `'${rawPath}' is an existing directory, cannot write as a file.`,
      });
    }

    if (args.overwrite === false) {
      return JSON.stringify({
        error: `File '${rawPath}' already exists and overwrite=false. File was not modified.`,
      });
    }
  }

  try {
    const parentDir = path.dirname(resolvedPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, args.content, "utf-8");

    const lines = args.content.split(/\r?\n/).length;
    const bytes = Buffer.byteLength(args.content, "utf-8");

    return JSON.stringify({
      file: rawPath,
      success: true,
      written_bytes: bytes,
      lines,
      message: `File '${rawPath}' saved successfully (${bytes} bytes, ${lines} lines).`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      error: `Error writing file '${rawPath}': ${message}`,
    });
  }
}

export const writeFileToolExecutor: ToolExecutor<WriteFileArgs> = {
  definition: writeFileToolDefinition,
  execute: executeWriteFile,
};
