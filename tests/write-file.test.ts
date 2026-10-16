import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeWriteFile, writeFileToolDefinition } from "../src/tools/write-file.js";
import { executeTool, getAllToolDefinitions } from "../src/tools/index.js";

describe("Tool: write_file (TDD)", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mistral-cli-write-test-"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("define el esquema de tool para Mistral AI con nombre 'write_file'", () => {
    expect(writeFileToolDefinition.type).toBe("function");
    expect(writeFileToolDefinition.function.name).toBe("write_file");
    expect(writeFileToolDefinition.function.parameters.required).toContain("path");
    expect(writeFileToolDefinition.function.parameters.required).toContain("content");
  });

  it("crea un nuevo archivo con el contenido especificado", async () => {
    const rawResult = await executeWriteFile(
      { path: "new-file.txt", content: "Hola desde Codestral!" },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.file).toBe("new-file.txt");
    expect(result.success).toBe(true);

    const writtenContent = fs.readFileSync(path.join(tempDir, "new-file.txt"), "utf-8");
    expect(writtenContent).toBe("Hola desde Codestral!");
  });

  it("crea directorios intermedios si no existen", async () => {
    const rawResult = await executeWriteFile(
      { path: "src/utils/math.ts", content: "export const add = (a: number, b: number) => a + b;" },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "src", "utils", "math.ts"))).toBe(true);
  });

  it("sobrescribe un archivo existente cuando overwrite es true o por defecto", async () => {
    await executeWriteFile({ path: "config.json", content: "{\"version\": 1}" }, tempDir);
    const rawResult = await executeWriteFile({ path: "config.json", content: "{\"version\": 2}" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.success).toBe(true);
    const updated = fs.readFileSync(path.join(tempDir, "config.json"), "utf-8");
    expect(updated).toBe("{\"version\": 2}");
  });

  it("no sobrescribe si overwrite es false y el archivo ya existe", async () => {
    await executeWriteFile({ path: "locked.txt", content: "Original" }, tempDir);
    const rawResult = await executeWriteFile(
      { path: "locked.txt", content: "Modificado", overwrite: false },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/ya existe.*overwrite=false/);
    const current = fs.readFileSync(path.join(tempDir, "locked.txt"), "utf-8");
    expect(current).toBe("Original");
  });

  it("bloquea intentos de path traversal fuera del workspace", async () => {
    const rawResult = await executeWriteFile(
      { path: "../malicious.txt", content: "Ataque" },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/Acceso denegado.*fuera del espacio de trabajo/);
  });

  it("falla si la ruta es un directorio existente", async () => {
    fs.mkdirSync(path.join(tempDir, "existing_dir"));
    const rawResult = await executeWriteFile(
      { path: "existing_dir", content: "Texto" },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/es un directorio/);
  });

  it("está registrada en el tool registry global", async () => {
    const tools = getAllToolDefinitions();
    const writeTool = tools.find((t) => t.function.name === "write_file");
    expect(writeTool).toBeDefined();

    const rawResult = await executeTool(
      "write_file",
      { path: "via-registry.txt", content: "Prueba desde registry" },
      tempDir
    );
    const result = JSON.parse(rawResult);
    expect(result.success).toBe(true);
  });
});
