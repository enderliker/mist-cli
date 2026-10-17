import fs from "node:fs";
import path from "node:path";
import { MistralTool, ToolExecutor } from "./types.js";
import { isPathInside } from "./read-file.js";

export interface SearchFilesArgs {
  pattern: string;
  path?: string;
  case_sensitive?: boolean;
  file_pattern?: string;
  max_results?: number;
}

export interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

export const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".gemini",
  ".codex",
  ".github",
  ".agents",
]);

export const searchFilesToolDefinition: MistralTool = {
  type: "function",
  function: {
    name: "search_files",
    description:
      "Searches for a text or regex pattern across files in the workspace. Returns matched file paths, line numbers, and line contents.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Text or regular expression pattern to search for.",
        },
        path: {
          type: "string",
          description:
            "Relative directory path to search within (defaults to '.' for workspace root).",
        },
        case_sensitive: {
          type: "boolean",
          description: "Whether the search is case-sensitive (default: false).",
        },
        file_pattern: {
          type: "string",
          description:
            "Optional file name or extension filter (e.g. '*.ts', 'package.json', '.md').",
        },
        max_results: {
          type: "number",
          description: "Maximum number of matching lines to return (default: 50, max: 100).",
        },
      },
      required: ["pattern"],
    },
  },
};

function matchesFilePattern(fileName: string, pattern?: string): boolean {
  if (!pattern) return true;
  const trimmed = pattern.trim().toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (trimmed.startsWith("*.")) {
    const ext = trimmed.slice(1); // e.g. '.ts'
    return lowerName.endsWith(ext);
  }

  if (trimmed.includes("*")) {
    const regexStr = "^" + trimmed.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
    return new RegExp(regexStr).test(lowerName);
  }

  return lowerName.includes(trimmed);
}

export async function executeSearchFiles(
  args: SearchFilesArgs,
  workspaceDir: string = process.cwd()
): Promise<string> {
  const pattern = args.pattern?.trim();
  if (!pattern) {
    return JSON.stringify({
      error: "Missing required argument 'pattern'.",
    });
  }

  const rawPath = args.path?.trim() || ".";
  const resolvedBase = path.resolve(workspaceDir);
  const searchRoot = path.resolve(resolvedBase, rawPath);

  if (!isPathInside(resolvedBase, searchRoot)) {
    return JSON.stringify({
      error: `Access denied: Path '${rawPath}' is outside the allowed workspace.`,
    });
  }

  if (!fs.existsSync(searchRoot)) {
    return JSON.stringify({
      error: `Directory or path '${rawPath}' does not exist in the workspace.`,
    });
  }

  const maxResults = Math.min(Math.max(args.max_results ?? 50, 1), 100);
  const caseSensitive = Boolean(args.case_sensitive);

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, caseSensitive ? "" : "i");
  } catch {
    // If not a valid regex, escape literal pattern
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(escaped, caseSensitive ? "" : "i");
  }

  const matches: SearchMatch[] = [];
  let truncated = false;

  function walk(currentDir: string): void {
    if (matches.length >= maxResults) {
      truncated = true;
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matches.length >= maxResults) {
        truncated = true;
        break;
      }

      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (!matchesFilePattern(entry.name, args.file_pattern)) {
          continue;
        }

        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > 200 * 1024) {
            // Skip large files (>200 KB) to prevent memory and performance degradation
            continue;
          }

          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split(/\r?\n/);
          const relPath = path.relative(resolvedBase, fullPath);

          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push({
                file: relPath,
                line: i + 1,
                text: lines[i].trim().slice(0, 300),
              });

              if (matches.length >= maxResults) {
                truncated = true;
                break;
              }
            }
          }
        } catch {
          // Skip binary or unreadable files
        }
      }
    }
  }

  const stats = fs.statSync(searchRoot);
  if (stats.isFile()) {
    try {
      const content = fs.readFileSync(searchRoot, "utf-8");
      const lines = content.split(/\r?\n/);
      const relPath = path.relative(resolvedBase, searchRoot);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            file: relPath,
            line: i + 1,
            text: lines[i].trim().slice(0, 300),
          });
          if (matches.length >= maxResults) {
            truncated = true;
            break;
          }
        }
      }
    } catch (err: any) {
      return JSON.stringify({
        error: `Failed to search file '${rawPath}': ${err.message}`,
      });
    }
  } else {
    walk(searchRoot);
  }

  return JSON.stringify(
    {
      query: pattern,
      matches_count: matches.length,
      truncated,
      matches,
    },
    null,
    2
  );
}

export const searchFilesToolExecutor: ToolExecutor<SearchFilesArgs> = {
  definition: searchFilesToolDefinition,
  execute: executeSearchFiles,
};
