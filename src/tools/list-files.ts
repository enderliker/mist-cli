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
      "Lista archivos y carpetas dentro de un directorio del espacio de trabajo. Excluye automáticamente directorios de dependencias y control de versiones como node_modules y .git.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Ruta relativa del directorio a explorar (por defecto '.' para la raíz del espacio de trabajo).",
        },
      },
    },
  },
};

/**
 * Ejecuta la lista de archivos dentro del workspace.
 */
export async function executeListFiles(
  args: ListFilesArgs = {},
  workspaceDir: string = process.cwd()
): Promise<string> {
  const rawPath = args.path?.trim() || ".";
  const resolvedBase = path.resolve(workspaceDir);
  const resolvedPath = path.resolve(resolvedBase, rawPath);

  // Verificación de seguridad contra Path Traversal
  if (!isPathInside(resolvedBase, resolvedPath)) {
    return JSON.stringify({
      error: `Acceso denegado: La ruta '${rawPath}' se encuentra fuera del espacio de trabajo permitido.`,
    });
  }

  if (!fs.existsSync(resolvedPath)) {
    return JSON.stringify({
      error: `El directorio '${rawPath}' no existe en el espacio de trabajo.`,
    });
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isDirectory()) {
    return JSON.stringify({
      error: `'${rawPath}' es un archivo, no un directorio. Usa 'read_file' para ver su contenido.`,
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
        // Mostrar directorios primero, luego archivos alfabéticamente
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
      error: `Error al listar el directorio '${rawPath}': ${message}`,
    });
  }
}

export const listFilesToolExecutor: ToolExecutor<ListFilesArgs> = {
  definition: listFilesToolDefinition,
  execute: executeListFiles,
};
