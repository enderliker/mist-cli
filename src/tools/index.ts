import { MistralTool, ToolExecutor, ConfirmCallback } from "./types.js";
import { readFileToolExecutor, ReadFileArgs } from "./read-file.js";
import { listFilesToolExecutor, ListFilesArgs } from "./list-files.js";
import { writeFileToolExecutor, WriteFileArgs } from "./write-file.js";

export * from "./types.js";
export * from "./read-file.js";
export * from "./list-files.js";
export * from "./write-file.js";

/**
 * Registro de herramientas activas en el CLI.
 */
const toolRegistry = new Map<string, ToolExecutor<any>>();

// Registrar herramientas por defecto para Beta 0.1
toolRegistry.set("read_file", readFileToolExecutor);
toolRegistry.set("list_files", listFilesToolExecutor);
toolRegistry.set("write_file", writeFileToolExecutor);

/**
 * Obtiene todas las definiciones de herramientas para enviar a Mistral.
 */
export function getAllToolDefinitions(): MistralTool[] {
  return Array.from(toolRegistry.values()).map((tool) => tool.definition);
}

/**
 * Ejecuta una herramienta por nombre con los argumentos proporcionados.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  workspaceDir: string = process.cwd(),
  onConfirm?: ConfirmCallback
): Promise<string> {
  const tool = toolRegistry.get(toolName);
  if (!tool) {
    return JSON.stringify({
      error: `La herramienta '${toolName}' no está registrada en el sistema.`,
    });
  }

  try {
    return await tool.execute(args, workspaceDir, onConfirm);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      error: `Fallo inesperado al ejecutar la herramienta '${toolName}': ${message}`,
    });
  }
}
