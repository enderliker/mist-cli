import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { CodestralAgent } from "./agent.js";
import { resolveConfig, MistralCliConfig } from "./config.js";

export const VERSION = "0.1.0-beta.1";

export interface ParsedArgs {
  help: boolean;
  version: boolean;
  model?: string;
  baseUrl?: string;
  prompt?: string;
}

/**
 * Parsea los argumentos de línea de comandos simples.
 */
export function parseArgs(args: string[]): ParsedArgs {
  let help = false;
  let version = false;
  let model: string | undefined;
  let baseUrl: string | undefined;
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      help = true;
    } else if (arg === "-v" || arg === "--version") {
      version = true;
    } else if (arg === "-m" || arg === "--model") {
      model = args[++i];
    } else if (arg === "-b" || arg === "--base-url") {
      baseUrl = args[++i];
    } else if (!arg.startsWith("-")) {
      promptParts.push(arg);
    }
  }

  return {
    help,
    version,
    model,
    baseUrl,
    prompt: promptParts.length > 0 ? promptParts.join(" ") : undefined,
  };
}

export function printHelp(): void {
  console.log(`
Mistral CLI (Codestral) - v${VERSION}
Uso:
  mistral-cli [opciones] [prompt]

Opciones:
  -h, --help            Muestra este mensaje de ayuda
  -v, --version         Muestra la versión instalada
  -m, --model <modelo>  Sobrescribe el modelo (por defecto: codestral-latest)
  -b, --base-url <url>  Sobrescribe la URL base de la API de Mistral

Modos de uso:
  1. Modo One-Shot:
     mistral-cli "¿Qué funciones exporta src/config.ts?"
     mistral-cli -m codestral-2501 "Explica el contenido de package.json"

  2. Modo Interactivo (REPL):
     mistral-cli
     (Inicia una sesión interactiva con memoria de conversación)

Comandos en REPL:
  /help       Muestra la lista de comandos disponibles
  /clear      Reinicia el historial de la conversación
  /history    Muestra la cantidad de mensajes en el historial
  /exit       Sale de la sesión interactiva
`);
}

export function createPromptConfirmation(rl?: readline.Interface) {
  return async (description: string): Promise<boolean> => {
    if (!process.stdin.isTTY) {
      console.log(
        `\x1b[33m[Seguridad]\x1b[0m Denegado automáticamente: '${description}' (entorno no-TTY).`
      );
      return false;
    }

    const reader = rl ?? readline.createInterface({ input, output });
    try {
      const answer = await reader.question(
        `\n\x1b[33m⚠️  [Seguridad] Codestral solicita ${description}. ¿Autorizar? (s/N):\x1b[0m `
      );
      const trimmed = answer.trim().toLowerCase();
      return trimmed === "s" || trimmed === "si" || trimmed === "y" || trimmed === "yes";
    } finally {
      if (!rl) {
        reader.close();
      }
    }
  };
}

/**
 * Ejecuta una consulta única en modo One-Shot.
 */
export async function runOneShot(agent: CodestralAgent, prompt: string): Promise<number> {
  agent.setConfirmAction?.(createPromptConfirmation());
  try {
    const response = await agent.chat(prompt);
    console.log("\n" + response + "\n");
    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n\x1b[31mError:\x1b[0m ${msg}\n`);
    return 1;
  }
}

/**
 * Maneja comandos especiales dentro del REPL (/exit, /clear, /history, /help).
 */
export function handleReplCommand(
  cmd: string,
  agent: CodestralAgent
): "exit" | "handled" | "continue" {
  switch (cmd) {
    case "/exit":
    case "/quit":
      console.log("¡Hasta luego!");
      return "exit";
    case "/clear":
      agent.clearHistory();
      console.log("\x1b[33mHistorial de conversación reiniciado.\x1b[0m\n");
      return "handled";
    case "/history":
      console.log(`\x1b[34mTotal de mensajes en memoria: ${agent.getHistory().length}\x1b[0m\n`);
      return "handled";
    case "/help":
      console.log(`\nComandos disponibles:\n  /help     - Muestra este menú de ayuda\n  /clear    - Limpia la memoria y reinicia el contexto\n  /history  - Muestra la cantidad de mensajes actuales\n  /exit     - Cierra el CLI\n`);
      return "handled";
    default:
      return "continue";
  }
}

/**
 * Inicia el modo interactivo REPL con historial y soporte para herramientas locales.
 */
export async function runRepl(agent: CodestralAgent): Promise<void> {
  const config = agent.getConfig();
  console.log("\x1b[32m" + "=".repeat(60) + "\x1b[0m");
  console.log(`\x1b[1mMistral Codestral CLI\x1b[0m (v${VERSION})`);
  console.log(`Modelo activo: \x1b[33m${config.model}\x1b[0m`);
  console.log(`Endpoint:      \x1b[34m${config.serverURL}\x1b[0m`);
  console.log(`Espacio de trabajo: ${process.cwd()}`);
  console.log("Escribe tu consulta o usa \x1b[36m/help\x1b[0m, \x1b[36m/clear\x1b[0m o \x1b[36m/exit\x1b[0m.");
  console.log("\x1b[32m" + "=".repeat(60) + "\x1b[0m\n");

  const rl = readline.createInterface({ input, output });
  agent.setConfirmAction?.(createPromptConfirmation(rl));

  try {
    while (true) {
      const line = await rl.question("\x1b[1;35mcodestral>\x1b[0m ");
      const trimmed = line.trim();

      if (!trimmed) continue;

      const action = handleReplCommand(trimmed, agent);
      if (action === "exit") break;
      if (action === "handled") continue;

      try {
        const reply = await agent.chat(trimmed);
        console.log(`\n${reply}\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\x1b[31m[Error]\x1b[0m ${msg}\n`);
      }
    }
  } finally {
    rl.close();
  }
}

/**
 * Punto de entrada principal para el CLI.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    printHelp();
    return 0;
  }

  if (parsed.version) {
    console.log(`mistral-cli v${VERSION}`);
    return 0;
  }

  let config: MistralCliConfig;
  try {
    config = resolveConfig();
    if (parsed.model) config.model = parsed.model;
    if (parsed.baseUrl) config.serverURL = parsed.baseUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31mError de configuración:\x1b[0m ${message}`);
    console.error("\nPuede definirla temporalmente ejecutando:");
    console.error("  export MISTRAL_API_KEY=\"tu_api_key\"");
    console.error("  o crear un archivo .env en este directorio.");
    return 1;
  }

  const agent = new CodestralAgent({
    config,
    onToolCall: (name, args) => {
      console.log(`\x1b[36m[Herramienta]\x1b[0m Ejecutando '${name}' con parámetros:`, args);
    },
    onToolResult: (name, result) => {
      const summary = result.length > 150 ? result.slice(0, 150) + "..." : result;
      console.log(`\x1b[32m[Herramienta]\x1b[0m '${name}' completada.`);
    },
  });

  if (parsed.prompt) {
    return await runOneShot(agent, parsed.prompt);
  }

  await runRepl(agent);
  return 0;
}
