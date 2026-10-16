import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeListFiles, listFilesToolDefinition } from "../src/tools/list-files.js";
import { executeTool, getAllToolDefinitions } from "../src/tools/index.js";

describe("Tool: list_files (TDD)", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mistral-cli-list-test-"));
    // Crear estructura de prueba
    fs.writeFileSync(path.join(tempDir, "file1.txt"), "Hola");
    fs.writeFileSync(path.join(tempDir, "file2.ts"), "const x = 1;");
    fs.mkdirSync(path.join(tempDir, "subfolder"));
    fs.writeFileSync(path.join(tempDir, "subfolder", "nested.txt"), "Anidado");

    // Carpetas que deben ser ignoradas por defecto
    fs.mkdirSync(path.join(tempDir, "node_modules"));
    fs.writeFileSync(path.join(tempDir, "node_modules", "ignore.js"), "// ignore");
    fs.mkdirSync(path.join(tempDir, ".git"));
    fs.writeFileSync(path.join(tempDir, ".git", "config"), "git config");
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("define el esquema de tool para Mistral AI con nombre 'list_files'", () => {
    expect(listFilesToolDefinition.type).toBe("function");
    expect(listFilesToolDefinition.function.name).toBe("list_files");
    expect(listFilesToolDefinition.function.parameters).toBeDefined();
  });

  it("lista los archivos del directorio raíz ignorando node_modules y .git", async () => {
    const rawResult = await executeListFiles({ path: "." }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.path).toBe(".");
    expect(Array.isArray(result.entries)).toBe(true);

    const names = result.entries.map((e: { name: string }) => e.name);
    expect(names).toContain("file1.txt");
    expect(names).toContain("file2.ts");
    expect(names).toContain("subfolder");
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain(".git");
  });

  it("soporta listar subdirectorios específicos", async () => {
    const rawResult = await executeListFiles({ path: "subfolder" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.path).toBe("subfolder");
    const names = result.entries.map((e: { name: string }) => e.name);
    expect(names).toContain("nested.txt");
  });

  it("bloquea intentos de path traversal fuera del workspace", async () => {
    const rawResult = await executeListFiles({ path: "../.." }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/Acceso denegado.*fuera del espacio de trabajo/);
  });

  it("devuelve error si la ruta no existe", async () => {
    const rawResult = await executeListFiles({ path: "carpeta_inexistente" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/no existe en el espacio de trabajo/);
  });

  it("devuelve error si la ruta es un archivo en lugar de un directorio", async () => {
    const rawResult = await executeListFiles({ path: "file1.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/es un archivo, no un directorio/);
  });

  it("está registrada en el tool registry global", async () => {
    const tools = getAllToolDefinitions();
    const listTool = tools.find((t) => t.function.name === "list_files");
    expect(listTool).toBeDefined();

    const rawResult = await executeTool("list_files", { path: "." }, tempDir);
    const result = JSON.parse(rawResult);
    expect(result.entries).toBeDefined();
  });
});
