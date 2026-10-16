import fs from "node:fs";
import path from "node:path";
import { MistralTool, ToolExecutor } from "./types.js";
import { isPathInside } from "./read-file.js";

export interface ListFilesArgs {
  path?: string;
}

export const IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  ".gemini",
  ".DS_Store",
]);

export const listFilesToolDefinition: MistralTool = {
  type: "function",
  function: {
    name: "list_files",
    description:
      "Lists files and directories in a workspace directory. Automatically excludes dependency and VCS directories like node_modules and .git.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Relative directory path to explore (defaults to '.' for workspace root).",
        },
      },
    },
  },
};

export async function executeListFiles(
  args: ListFilesArgs = {},
  workspaceDir: string = process.cwd()
): Promise<string> {
  const rawPath = args.path?.trim() || ".";
  const resolvedBase = path.resolve(workspaceDir);
  const resolvedPath = path.resolve(resolvedBase, rawPath);

  if (!isPathInside(resolvedBase, resolvedPath)) {
    return JSON.stringify({
      error: `Access denied: Path '${rawPath}' is outside the allowed workspace.`,
    });
  }

  if (!fs.existsSync(resolvedPath)) {
    return JSON.stringify({
      error: `Directory '${rawPath}' does not exist in the workspace.`,
    });
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isDirectory()) {
    return JSON.stringify({
      error: `'${rawPath}' is a file, not a directory. Use 'read_file' to view its content.`,
    });
  }

  try {
    const dirEntries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const filteredEntries = dirEntries
      .filter((entry) => !IGNORED_NAMES.has(entry.name))
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
      }))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    return JSON.stringify({
      path: rawPath,
      total_entries: filteredEntries.length,
      entries: filteredEntries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      error: `Error listing directory '${rawPath}': ${message}`,
    });
  }
}

export const listFilesToolExecutor: ToolExecutor<ListFilesArgs> = {
  definition: listFilesToolDefinition,
  execute: executeListFiles,
};
