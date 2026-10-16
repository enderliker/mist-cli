import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodestralAgent } from "../src/agent.js";
import { MistralCliConfig } from "../src/config.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("CodestralAgent", () => {
  const dummyConfig: MistralCliConfig = {
    apiKey: "test-key",
    serverURL: "https://api.mistral.ai",
    model: "codestral-latest",
  };

  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-test-"));
    fs.writeFileSync(path.join(tempDir, "sample.txt"), "Contenido de prueba");
  });

  it("inicializa el agente con prompt de sistema y permite reiniciar historial", () => {
    const mockClient = { chat: { complete: vi.fn() } } as any;
    const agent = new CodestralAgent({
      client: mockClient,
      config: dummyConfig,
      workspaceDir: tempDir,
    });

    const history = agent.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].role).toBe("system");

    agent.clearHistory();
    expect(agent.getHistory().length).toBe(1);
  });

  it("responde directamente cuando el modelo no genera llamadas a herramientas", async () => {
    const mockClient = {
      chat: {
        complete: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                role: "assistant",
                content: "¡Hola! ¿En qué puedo ayudarte?",
                toolCalls: null,
              },
            },
          ],
        }),
      },
    } as any;

    const agent = new CodestralAgent({
      client: mockClient,
      config: dummyConfig,
      workspaceDir: tempDir,
    });

    const reply = await agent.chat("Hola");

    expect(reply).toBe("¡Hola! ¿En qué puedo ayudarte?");
    const history = agent.getHistory();
    expect(history.length).toBe(3); // system, user, assistant
    expect(history[1].content).toBe("Hola");
    expect(history[2].content).toBe("¡Hola! ¿En qué puedo ayudarte?");
  });

  it("ejecuta bucle de Function Calling cuando el modelo solicita leer un archivo", async () => {
    const toolCallMock = {
      id: "call_abc123",
      type: "function",
      function: {
        name: "read_file",
        arguments: JSON.stringify({ path: "sample.txt" }),
      },
    };

    const mockComplete = vi
      .fn()
      // Primera llamada: el modelo pide invocar read_file
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              toolCalls: [toolCallMock],
            },
          },
        ],
      })
      // Segunda llamada: el modelo recibe el resultado del tool y responde
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "El archivo contiene: Contenido de prueba",
              toolCalls: null,
            },
          },
        ],
      });

    const mockClient = { chat: { complete: mockComplete } } as any;

    const toolCallsFired: string[] = [];
    const toolResultsFired: string[] = [];

    const agent = new CodestralAgent({
      client: mockClient,
      config: dummyConfig,
      workspaceDir: tempDir,
      onToolCall: (name, args) => toolCallsFired.push(name),
      onToolResult: (name, res) => toolResultsFired.push(name),
    });

    const reply = await agent.chat("¿Qué dice sample.txt?");

    expect(reply).toBe("El archivo contiene: Contenido de prueba");
    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(toolCallsFired).toEqual(["read_file"]);
    expect(toolResultsFired).toEqual(["read_file"]);

    const history = agent.getHistory();
    // Mensajes esperados:
    // 0: system
    // 1: user
    // 2: assistant (con toolCalls)
    // 3: tool (con toolCallId call_abc123 y resultado)
    // 4: assistant (respuesta final)
    expect(history.length).toBe(5);
    expect(history[2].role).toBe("assistant");
    expect(history[2].toolCalls?.[0].id).toBe("call_abc123");
    expect(history[3].role).toBe("tool");
    expect(history[3].toolCallId).toBe("call_abc123");
    expect(history[3].content).toContain("Contenido de prueba");
    expect(history[4].role).toBe("assistant");
    expect(history[4].content).toBe("El archivo contiene: Contenido de prueba");
  });

  it("detiene el bucle de herramientas si excede maxIterations", async () => {
    const loopToolCall = {
      id: "call_loop",
      type: "function",
      function: {
        name: "read_file",
        arguments: JSON.stringify({ path: "sample.txt" }),
      },
    };

    // Siempre devuelve tool calls
    const mockClient = {
      chat: {
        complete: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                toolCalls: [loopToolCall],
              },
            },
          ],
        }),
      },
    } as any;

    const agent = new CodestralAgent({
      client: mockClient,
      config: dummyConfig,
      workspaceDir: tempDir,
      maxIterations: 2,
    });

    const reply = await agent.chat("Loop");

    expect(reply).toContain("Se alcanzó el número máximo");
    expect(mockClient.chat.complete).toHaveBeenCalledTimes(2);
  });
});
