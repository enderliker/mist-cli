import fs from "node:fs";
import path from "node:path";
import { MistralTool, ToolExecutor } from "./types.js";
import { isPathInside } from "./read-file.js";

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
      "Crea o sobrescribe un archivo en el espacio de trabajo con el contenido proporcionado. Crea carpetas intermedias automáticamente si no existen.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta relativa del archivo a crear o sobrescribir en el espacio de trabajo.",
        },
        content: {
          type: "string",
          description: "El contenido textual que se escribirá en el archivo.",
        },
        overwrite: {
          type: "boolean",
          description: "Indica si se debe sobrescribir el archivo en caso de que ya exista (por defecto true).",
        },
      },
      required: ["path", "content"],
    },
  },
};

/**
 * Ejecuta la escritura segura de un archivo dentro del workspace.
 */
export async function executeWriteFile(
  args: WriteFileArgs,
  workspaceDir: string = process.cwd()
): Promise<string> {
  if (!args || typeof args.path !== "string" || args.path.trim() === "") {
    return JSON.stringify({
      error: "El argumento 'path' es requerido y debe ser una cadena válida.",
    });
  }

  if (typeof args.content !== "string") {
    return JSON.stringify({
      error: "El argumento 'content' es requerido y debe ser una cadena de texto.",
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

  if (fs.existsSync(resolvedPath)) {
    const stats = fs.statSync(resolvedPath);
    if (stats.isDirectory()) {
      return JSON.stringify({
        error: `'${rawPath}' es un directorio existente, no se puede escribir como archivo.`,
      });
    }

    if (args.overwrite === false) {
      return JSON.stringify({
        error: `El archivo '${rawPath}' ya existe y se indicó overwrite=false. No se modificó el archivo.`,
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
      message: `Archivo '${rawPath}' guardado exitosamente (${bytes} bytes, ${lines} líneas).`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      error: `Error al escribir el archivo '${rawPath}': ${message}`,
    });
  }
}

export const writeFileToolExecutor: ToolExecutor<WriteFileArgs> = {
  definition: writeFileToolDefinition,
  execute: executeWriteFile,
};
