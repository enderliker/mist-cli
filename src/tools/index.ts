import { MistralTool, ToolExecutor, ConfirmCallback } from "./types.js";
import { readFileToolExecutor } from "./read-file.js";
import { listFilesToolExecutor } from "./list-files.js";
import { writeFileToolExecutor } from "./write-file.js";
import { executeCommandToolExecutor } from "./execute-command.js";

export * from "./types.js";
export * from "./read-file.js";
export * from "./list-files.js";
export * from "./write-file.js";
export * from "./execute-command.js";
export * from "./sandbox/bubblewrap.js";

const toolRegistry = new Map<string, ToolExecutor<any>>();

toolRegistry.set("read_file", readFileToolExecutor);
toolRegistry.set("list_files", listFilesToolExecutor);
toolRegistry.set("write_file", writeFileToolExecutor);
toolRegistry.set("execute_command", executeCommandToolExecutor);

export function getAllToolDefinitions(): MistralTool[] {
  return Array.from(toolRegistry.values()).map((tool) => tool.definition);
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  workspaceDir: string = process.cwd(),
  onConfirm?: ConfirmCallback
): Promise<string> {
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    return JSON.stringify({
      error: `Tool '${toolName}' is not registered in the system.`,
    });
  }

  try {
    return await tool.execute(args, workspaceDir, onConfirm);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      error: `Unexpected failure while executing tool '${toolName}': ${message}`,
    });
  }
}
