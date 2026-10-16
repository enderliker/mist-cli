import { describe, it, expect, vi } from "vitest";
import { parseArgs, runOneShot, VERSION } from "../src/cli.js";
import { CodestralAgent } from "../src/agent.js";

describe("CLI Argument Parsing", () => {
  it("detecta flags de ayuda", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("detecta flags de versión", () => {
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
    expect(VERSION).toBe("0.1.0-beta.1");
  });

  it("parsea modelo y base-url personalizados", () => {
    const res = parseArgs([
      "-m",
      "codestral-2501",
      "-b",
      "https://custom.mistral.test/v1",
      "Hola",
      "mundo",
    ]);

    expect(res.model).toBe("codestral-2501");
    expect(res.baseUrl).toBe("https://custom.mistral.test/v1");
    expect(res.prompt).toBe("Hola mundo");
  });

  it("combina argumentos posicionales como un prompt único", () => {
    const res = parseArgs(["Explica", "el", "archivo", "index.ts"]);
    expect(res.prompt).toBe("Explica el archivo index.ts");
  });

  it("ejecuta runOneShot exitosamente", async () => {
    const mockAgent = {
      chat: vi.fn().mockResolvedValue("Explicación del archivo."),
      setConfirmAction: vi.fn(),
    } as unknown as CodestralAgent;

    const exitCode = await runOneShot(mockAgent, "Explica index.ts");
    expect(exitCode).toBe(0);
    expect(mockAgent.chat).toHaveBeenCalledWith("Explica index.ts");
    expect(mockAgent.setConfirmAction).toHaveBeenCalled();
  });

  it("maneja errores en runOneShot retornando código 1", async () => {
    const mockAgent = {
      chat: vi.fn().mockRejectedValue(new Error("Fallo de red")),
      setConfirmAction: vi.fn(),
    } as unknown as CodestralAgent;

    const exitCode = await runOneShot(mockAgent, "Error test");
    expect(exitCode).toBe(1);
  });

  it("procesa comandos especiales del REPL correctamente", async () => {
    const { handleReplCommand } = await import("../src/cli.js");
    const mockAgent = {
      clearHistory: vi.fn(),
      getHistory: vi.fn().mockReturnValue([{}, {}]),
    } as unknown as CodestralAgent;

    expect(handleReplCommand("/exit", mockAgent)).toBe("exit");
    expect(handleReplCommand("/quit", mockAgent)).toBe("exit");

    expect(handleReplCommand("/clear", mockAgent)).toBe("handled");
    expect(mockAgent.clearHistory).toHaveBeenCalled();

    expect(handleReplCommand("/history", mockAgent)).toBe("handled");
    expect(mockAgent.getHistory).toHaveBeenCalled();

    expect(handleReplCommand("/help", mockAgent)).toBe("handled");
    expect(handleReplCommand("¿Qué tal?", mockAgent)).toBe("continue");
  });
});
