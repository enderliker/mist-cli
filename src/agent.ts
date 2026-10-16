import { Mistral } from "@mistralai/mistralai";
import { MistralCliConfig, resolveConfig, createMistralClient } from "./config.js";
import { getAllToolDefinitions, executeTool } from "./tools/index.js";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    type?: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface AgentOptions {
  client?: Mistral;
  config?: MistralCliConfig;
  workspaceDir?: string;
  systemPrompt?: string;
  maxIterations?: number;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: string) => void;
  onConfirmAction?: (description: string) => Promise<boolean> | boolean;
}

export const DEFAULT_SYSTEM_PROMPT = `Eres un asistente de programación y análisis de código potenciado por Codestral (Mistral AI).
Tienes acceso a herramientas locales para interactuar con el espacio de trabajo del usuario:
- 'list_files': para explorar el contenido de carpetas y descubrir la estructura del proyecto.
- 'read_file': para examinar el contenido de archivos antes de responder o modificarlos.
- 'write_file': para crear o modificar archivos cuando el usuario te pida escribir o actualizar código.
Usa las herramientas de forma proactiva y segura. Responde de manera precisa, concisa y útil en formato Markdown.`;

export const MAX_TOOL_ITERATIONS = 5;

/**
 * Normaliza el contenido de un mensaje que puede ser string, array de chunks o nulo.
 */
export function extractTextContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === "string" ? item : (item as any)?.text ?? JSON.stringify(item)))
      .join("\n");
  }
  return content == null ? null : String(content);
}

/**
 * Parsea con seguridad los argumentos JSON enviados por el modelo para una herramienta.
 */
export function parseToolArguments(rawArgs: unknown): Record<string, unknown> {
  if (typeof rawArgs !== "string") {
    return rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};
  }
  try {
    return JSON.parse(rawArgs);
  } catch {
    return { raw: rawArgs };
  }
}

export class CodestralAgent {
  private client: Mistral;
  private config: MistralCliConfig;
  private workspaceDir: string;
  private systemPrompt: string;
  private maxIterations: number;
  private messages: ChatMessage[] = [];
  private onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  private onToolResult?: (toolName: string, result: string) => void;
  private onConfirmAction?: (description: string) => Promise<boolean> | boolean;

  constructor(options: AgentOptions = {}) {
    this.config = options.config ?? resolveConfig();
    this.client = options.client ?? createMistralClient(this.config);
    this.workspaceDir = options.workspaceDir ?? process.cwd();
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.maxIterations = options.maxIterations ?? MAX_TOOL_ITERATIONS;
    this.onToolCall = options.onToolCall;
    this.onToolResult = options.onToolResult;
    this.onConfirmAction = options.onConfirmAction;

    this.clearHistory();
  }

  /**
   * Reinicia el historial conservando únicamente el prompt del sistema.
   */
  public clearHistory(): void {
    this.messages = [
      {
        role: "system",
        content: this.systemPrompt,
      },
    ];
  }

  /**
   * Devuelve una copia del historial de mensajes actual.
   */
  public getHistory(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Obtiene la configuración activa del agente.
   */
  public getConfig(): MistralCliConfig {
    return { ...this.config };
  }

  /**
   * Configura o actualiza el manejador de confirmación para acciones sensibles.
   */
  public setConfirmAction(
    callback?: (description: string) => Promise<boolean> | boolean
  ): void {
    this.onConfirmAction = callback;
  }

  /**
   * Envía un mensaje de usuario y procesa el bucle de Function Calling si el modelo solicita tools.
   */
  public async chat(userInput: string): Promise<string> {
    this.messages.push({
      role: "user",
      content: userInput,
    });

    const tools = getAllToolDefinitions();
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      // Llamada al endpoint chat.complete de Mistral
      const response = await this.client.chat.complete({
        model: this.config.model,
        messages: this.messages as any,
        tools: tools as any,
        toolChoice: "auto",
      });

      const choice = response.choices?.[0];
      if (!choice || !choice.message) {
        throw new Error("No se recibió ninguna respuesta válida del modelo Mistral.");
      }

      const assistantMsg = choice.message;
      const toolCalls = assistantMsg.toolCalls;

      // Si el modelo decide ejecutar una o varias herramientas
      if (toolCalls && toolCalls.length > 0) {
        this.messages.push({
          role: "assistant",
          content: extractTextContent(assistantMsg.content),
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id ?? "",
            type: tc.type ?? "function",
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments),
            },
          })),
        });

        for (const tc of toolCalls) {
          const functionName = tc.function.name;
          const parsedArgs = parseToolArguments(tc.function.arguments);

          if (this.onToolCall) {
            this.onToolCall(functionName, parsedArgs);
          }

          const toolResult = await executeTool(
            functionName,
            parsedArgs,
            this.workspaceDir,
            this.onConfirmAction
          );

          if (this.onToolResult) {
            this.onToolResult(functionName, toolResult);
          }

          this.messages.push({
            role: "tool",
            name: functionName,
            toolCallId: tc.id ?? "",
            content: toolResult,
          });
        }

        // Continúa la siguiente iteración enviando los resultados de las herramientas a Codestral
        continue;
      }

      // Si no hay toolCalls, es la respuesta final de texto para el usuario
      const finalContent = extractTextContent(assistantMsg.content) ?? "";

      this.messages.push({
        role: "assistant",
        content: finalContent,
      });

      return finalContent;
    }

    const warning = `[Aviso] Se alcanzó el número máximo de llamadas consecutivas a herramientas (${this.maxIterations}).`;
    this.messages.push({
      role: "assistant",
      content: warning,
    });
    return warning;
  }
}
