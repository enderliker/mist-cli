import fs from "node:fs";
import path from "node:path";
import { MistralTool, ToolExecutor, ConfirmCallback } from "./types.js";
import { isPathInside, isSensitiveFile } from "./read-file.js";

export interface EditFileArgs {
  path: string;
  target_content: string;
  replacement_content: string;
  expected_matches?: number;
}

export const editFileToolDefinition: MistralTool = {
  type: "function",
  function: {
    name: "edit_file",
    description:
      "Surgically replaces a specific block of text in a workspace file with new text. Safer and more token-efficient than rewriting the entire file. Fails closed if the target text does not match uniquely.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path in the workspace to edit.",
        },
        target_content: {
          type: "string",
          description:
            "Exact block of text to be replaced. Must match existing file content character-for-character including indentation.",
        },
        replacement_content: {
          type: "string",
          description: "New text content to insert in place of target_content.",
        },
        expected_matches: {
          type: "integer",
          description:
            "Expected number of occurrences to replace (defaults to 1 for unique replacement).",
        },
      },
      required: ["path", "target_content", "replacement_content"],
    },
  },
};

function countOccurrences(content: string, substring: string): number {
  if (!substring) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = content.indexOf(substring, pos)) !== -1) {
    count++;
    pos += substring.length;
  }
  return count;
}

export async function executeEditFile(
  args: EditFileArgs,
  workspaceDir: string = process.cwd(),
  onConfirm?: ConfirmCallback
): Promise<string> {
  const rawPath = args.path?.trim();
  if (!rawPath) {
    return JSON.stringify({
      error: "Missing required argument 'path'.",
    });
  }

  if (args.target_content === undefined || args.target_content === null) {
    return JSON.stringify({
      error: "Missing required argument 'target_content'.",
    });
  }

  if (args.replacement_content === undefined || args.replacement_content === null) {
    return JSON.stringify({
      error: "Missing required argument 'replacement_content'.",
    });
  }

  const resolvedBase = path.resolve(workspaceDir);
  const resolvedPath = path.resolve(resolvedBase, rawPath);

  if (!isPathInside(resolvedBase, resolvedPath)) {
    return JSON.stringify({
      error: `Access denied: Target path '${rawPath}' is outside the allowed workspace.`,
    });
  }

  if (!fs.existsSync(resolvedPath)) {
    return JSON.stringify({
      error: `File '${rawPath}' does not exist. Use 'write_file' to create new files.`,
    });
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile()) {
    return JSON.stringify({
      error: `'${rawPath}' is a directory, not a file.`,
    });
  }

  // Sensitive file check
  if (isSensitiveFile(resolvedPath)) {
    if (!onConfirm) {
      return JSON.stringify({
        error: `Access denied: Editing sensitive file '${rawPath}' requires interactive confirmation.`,
      });
    }

    const authorized = await onConfirm(`edit sensitive file '${rawPath}'`);
    if (!authorized) {
      return JSON.stringify({
        error: `User denied permission to edit sensitive file '${rawPath}'.`,
      });
    }
  }

  let originalContent: string;
  try {
    originalContent = fs.readFileSync(resolvedPath, "utf-8");
  } catch (err: any) {
    return JSON.stringify({
      error: `Failed to read '${rawPath}': ${err.message}`,
    });
  }

  const expectedMatches = Math.max(args.expected_matches ?? 1, 1);
  const actualOccurrences = countOccurrences(originalContent, args.target_content);

  if (actualOccurrences === 0) {
    return JSON.stringify({
      error: `Target content not found in '${rawPath}'. Verify exact characters, line breaks, and indentation using 'read_file'.`,
    });
  }

  if (actualOccurrences !== expectedMatches) {
    return JSON.stringify({
      error: `Ambiguous match: Target content was found ${actualOccurrences} time(s) in '${rawPath}', but expected exactly ${expectedMatches}. Provide more surrounding context lines to ensure a unique match.`,
    });
  }

  // Perform replacement
  let newContent: string;
  if (expectedMatches === 1) {
    const idx = originalContent.indexOf(args.target_content);
    newContent =
      originalContent.slice(0, idx) +
      args.replacement_content +
      originalContent.slice(idx + args.target_content.length);
  } else {
    newContent = originalContent.replaceAll(args.target_content, args.replacement_content);
  }

  try {
    // Atomic write via temp file
    const tempFile = `${resolvedPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, newContent, "utf-8");
    fs.renameSync(tempFile, resolvedPath);

    return JSON.stringify({
      success: true,
      path: rawPath,
      replacements: actualOccurrences,
      message: `Successfully replaced ${actualOccurrences} occurrence(s) in '${rawPath}'.`,
    });
  } catch (err: any) {
    return JSON.stringify({
      error: `Failed to write updates to '${rawPath}': ${err.message}`,
    });
  }
}

export const editFileToolExecutor: ToolExecutor<EditFileArgs> = {
  definition: editFileToolDefinition,
  execute: executeEditFile,
};
