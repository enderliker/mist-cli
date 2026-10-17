import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { CodestralAgent } from "./agent.js";
import { resolveConfig, MistralCliConfig } from "./config.js";
import { startTui } from "./ui/index.js";

export const VERSION = "0.3.0-beta.1";

export interface ParsedArgs {
  help: boolean;
  version: boolean;
  model?: string;
  baseUrl?: string;
  prompt?: string;
}

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
Usage:
  mistral-cli [options] [prompt]

Options:
  -h, --help            Show this help message
  -v, --version         Show installed version
  -m, --model <model>   Override model name (default: codestral-latest)
  -b, --base-url <url>  Override API base URL

Modes:
  1. One-Shot Mode:
     mistral-cli "What functions are exported in src/config.ts?"
     mistral-cli -m codestral-2501 "Explain package.json"

  2. Interactive REPL Mode:
     mistral-cli
     (Starts an interactive session with conversation memory)

REPL Commands:
  /help       Show available commands
  /clear      Reset conversation history
  /history    Show number of messages in memory
  /exit       Exit the interactive session
`);
}

export function createPromptConfirmation(rl?: readline.Interface) {
  return async (description: string): Promise<boolean> => {
    if (!process.stdin.isTTY) {
      console.log(
        `\x1b[33m[Security]\x1b[0m Automatically denied: '${description}' (non-TTY environment).`
      );
      return false;
    }

    const reader = rl ?? readline.createInterface({ input, output });
    try {
      const answer = await reader.question(
        `\n\x1b[33m⚠️  [Security] Codestral requests permission to ${description}. Authorize? (y/N):\x1b[0m `
      );
      const trimmed = answer.trim().toLowerCase();
      return trimmed === "y" || trimmed === "yes" || trimmed === "s" || trimmed === "si";
    } finally {
      if (!rl) {
        reader.close();
      }
    }
  };
}

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

export function handleReplCommand(
  cmd: string,
  agent: CodestralAgent
): "exit" | "handled" | "continue" {
  switch (cmd) {
    case "/exit":
    case "/quit":
      console.log("Goodbye!");
      return "exit";
    case "/clear":
      agent.clearHistory();
      console.log("\x1b[33mConversation history reset.\x1b[0m\n");
      return "handled";
    case "/history":
      console.log(`\x1b[34mTotal messages in memory: ${agent.getHistory().length}\x1b[0m\n`);
      return "handled";
    case "/help":
      console.log(`\nAvailable commands:\n  /help     - Show this help menu\n  /clear    - Clear conversation memory\n  /history  - Show message count\n  /exit     - Exit CLI\n`);
      return "handled";
    default:
      return "continue";
  }
}

export async function runRepl(agent: CodestralAgent): Promise<void> {
  if (process.stdin.isTTY) {
    await startTui(agent, VERSION);
    return;
  }

  const config = agent.getConfig();
  console.log("\x1b[32m" + "=".repeat(60) + "\x1b[0m");
  console.log(`\x1b[1mMistral Codestral CLI\x1b[0m (v${VERSION})`);
  console.log(`Model:     \x1b[33m${config.model}\x1b[0m`);
  console.log(`Endpoint:  \x1b[34m${config.serverURL}\x1b[0m`);
  console.log(`Workspace: ${process.cwd()}`);
  console.log("Type your prompt or use \x1b[36m/help\x1b[0m, \x1b[36m/clear\x1b[0m, or \x1b[36m/exit\x1b[0m.");
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
    console.error(`\x1b[31mConfiguration error:\x1b[0m ${message}`);
    console.error("\nYou can define it by running:");
    console.error("  export MISTRAL_API_KEY=\"your_api_key\"");
    console.error("  or by creating a .env file in this directory.");
    return 1;
  }

  const agent = new CodestralAgent({
    config,
    onToolCall: (name, args) => {
      console.log(`\x1b[36m[Tool]\x1b[0m Running '${name}' with arguments:`, args);
    },
    onToolResult: (name, result) => {
      console.log(`\x1b[32m[Tool]\x1b[0m '${name}' completed.`);
    },
  });

  if (parsed.prompt) {
    return await runOneShot(agent, parsed.prompt);
  }

  await runRepl(agent);
  return 0;
}
