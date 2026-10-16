import fs from "node:fs";
import path from "node:path";
import { MistralTool, ToolExecutor, ConfirmCallback } from "./types.js";

export interface ReadFileArgs {
  path: string;
  start_line?: number;
  end_line?: number;
}

export const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100 KB

export const readFileToolDefinition: MistralTool = {
  type: "function",
  function: {
    name: "read_file",
    description:
      "Lee el contenido de un archivo de texto en el espacio de trabajo. Soporta lectura completa o por rangos de líneas.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta relativa del archivo a leer dentro del espacio de trabajo.",
        },
        start_line: {
          type: "integer",
          description: "Número de línea inicial (1-indexed, opcional).",
        },
        end_line: {
          type: "integer",
          description: "Número de línea final (1-indexed, opcional).",
        },
      },
      required: ["path"],
    },
  },
};

/**
 * Valida si una ruta resuelta está de forma segura dentro del directorio base.
 */
export function isPathInside(baseDir: string, targetPath: string): boolean {
  const relative = path.relative(baseDir, targetPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Detecta si un archivo contiene secretos o información sensible (.env, keys, certs).
 */
export function isSensitiveFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (base.endsWith(".pem") || base.endsWith(".key") || base.startsWith("id_rsa")) return true;
  return false;
}

/**
 * Ejecuta la lectura segura de un archivo dentro del workspace.
 */
export async function executeReadFile(
  args: ReadFileArgs,
  workspaceDir: string = process.cwd(),
  onConfirmSensitive?: ConfirmCallback
): Promise<string> {
  if (!args || typeof args.path !== "string" || args.path.trim() === "") {
    return JSON.stringify({
      error: "El argumento 'path' es requerido y debe ser una cadena válida.",
    });
  }

  const rawPath = args.path.trim();
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
      error: `El archivo '${rawPath}' no existe en el espacio de trabajo.`,
    });
  }

  // Verificación de archivos sensibles (.env, claves privadas, certificados)
  if (isSensitiveFile(rawPath)) {
    if (!onConfirmSensitive) {
      return JSON.stringify({
        error: `Acceso denegado: '${rawPath}' es un archivo sensible. Se requiere confirmación explícita del usuario para leerlo.`,
      });
    }

    const allowed = await onConfirmSensitive(`leer el archivo sensible '${rawPath}'`);
    if (!allowed) {
      return JSON.stringify({
        error: `Lectura cancelada: El usuario denegó el acceso al archivo sensible '${rawPath}'.`,
      });
    }
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.isDirectory()) {
    return JSON.stringify({
      error: `'${rawPath}' es un directorio, no un archivo de texto.`,
    });
  }

  // Comprobar tamaño antes de leer en memoria
  if (stats.size > MAX_FILE_SIZE_BYTES && !args.start_line && !args.end_line) {
    return JSON.stringify({
      error: `El archivo '${rawPath}' es demasiado grande (${(stats.size / 1024).toFixed(
        1
      )} KB > ${MAX_FILE_SIZE_BYTES / 1024} KB). Especifica 'start_line' y 'end_line' para leer fragmentos específicos.`,
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
      error: `Error al leer el archivo '${rawPath}': ${message}`,
    });
  }
}

export const readFileToolExecutor: ToolExecutor<ReadFileArgs> = {
  definition: readFileToolDefinition,
  execute: executeReadFile,
};
