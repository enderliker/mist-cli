import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeReadFile, isPathInside, MAX_FILE_SIZE_BYTES } from "../src/tools/read-file.js";
import { executeTool, getAllToolDefinitions } from "../src/tools/index.js";

describe("Tool: read_file", () => {
  let tempDir: string;
  let testFile: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mistral-cli-test-"));
    testFile = path.join(tempDir, "sample.txt");
    fs.writeFileSync(
      testFile,
      "Línea 1: Hola Mundo\nLínea 2: Segunda línea\nLínea 3: Tercera línea\nLínea 4: Cuarta línea\nLínea 5: Fin"
    );
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("verifica definiciones registradas de herramientas", () => {
    const tools = getAllToolDefinitions();
    expect(tools.length).toBeGreaterThan(0);
    const readTool = tools.find((t) => t.function.name === "read_file");
    expect(readTool).toBeDefined();
    expect(readTool?.function.parameters).toHaveProperty("required");
  });

  it("lee un archivo completo correctamente", async () => {
    const rawResult = await executeReadFile({ path: "sample.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.file).toBe("sample.txt");
    expect(result.total_lines).toBe(5);
    expect(result.displayed_range).toEqual([1, 5]);
    expect(result.content).toContain("Línea 1: Hola Mundo");
    expect(result.content).toContain("Línea 5: Fin");
  });

  it("soporta lectura de un rango específico de líneas", async () => {
    const rawResult = await executeReadFile(
      { path: "sample.txt", start_line: 2, end_line: 4 },
      tempDir
    );
    const result = JSON.parse(rawResult);

    expect(result.displayed_range).toEqual([2, 4]);
    expect(result.content).toBe("Línea 2: Segunda línea\nLínea 3: Tercera línea\nLínea 4: Cuarta línea");
  });

  it("bloquea intentos de Path Traversal fuera del workspace", async () => {
    const rawResult = await executeReadFile({ path: "../../etc/passwd" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/Acceso denegado.*fuera del espacio de trabajo/);
  });

  it("devuelve un error claro si el archivo no existe", async () => {
    const rawResult = await executeReadFile({ path: "no-existe.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/no existe en el espacio de trabajo/);
  });

  it("devuelve un error si la ruta es un directorio", async () => {
    const rawResult = await executeReadFile({ path: "." }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/es un directorio/);
  });

  it("detecta y advierte sobre archivos que superan el límite de tamaño sin rango de líneas", async () => {
    const largeFile = path.join(tempDir, "large.txt");
    const largeContent = "A".repeat(MAX_FILE_SIZE_BYTES + 2048);
    fs.writeFileSync(largeFile, largeContent);

    const rawResult = await executeReadFile({ path: "large.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/demasiado grande/);
  });

  it("permite leer a través de executeTool en el registro", async () => {
    const rawResult = await executeTool("read_file", { path: "sample.txt" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.file).toBe("sample.txt");
  });

  it("devuelve error si se invoca una herramienta inexistente", async () => {
    const rawResult = await executeTool("invalid_tool", {}, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/no está registrada/);
  });

  it("detecta archivos sensibles como .env, .pem, .key", async () => {
    const { isSensitiveFile } = await import("../src/tools/read-file.js");
    expect(isSensitiveFile(".env")).toBe(true);
    expect(isSensitiveFile(".env.local")).toBe(true);
    expect(isSensitiveFile("server.key")).toBe(true);
    expect(isSensitiveFile("cert.pem")).toBe(true);
    expect(isSensitiveFile("id_rsa")).toBe(true);
    expect(isSensitiveFile("package.json")).toBe(false);
    expect(isSensitiveFile("src/index.ts")).toBe(false);
  });

  it("bloquea por defecto la lectura de archivos sensibles si no hay confirmación", async () => {
    fs.writeFileSync(path.join(tempDir, ".env"), "SECRET=123");
    const rawResult = await executeReadFile({ path: ".env" }, tempDir);
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/archivo sensible.*requiere confirmación/i);
  });

  it("permite leer archivo sensible si la confirmación es aprobada (true)", async () => {
    fs.writeFileSync(path.join(tempDir, ".env"), "SECRET=123");
    const rawResult = await executeReadFile(
      { path: ".env" },
      tempDir,
      async () => true
    );
    const result = JSON.parse(rawResult);

    expect(result.content).toBe("SECRET=123");
  });

  it("cancela la lectura de archivo sensible si el usuario responde 'n' (false)", async () => {
    fs.writeFileSync(path.join(tempDir, ".env"), "SECRET=123");
    const rawResult = await executeReadFile(
      { path: ".env" },
      tempDir,
      async () => false
    );
    const result = JSON.parse(rawResult);

    expect(result.error).toMatch(/el usuario denegó el acceso/i);
  });
});
