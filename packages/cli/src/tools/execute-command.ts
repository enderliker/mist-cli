import { MistralTool, ToolExecutor, ConfirmCallback } from "./types.js";
import {
  isBubblewrapAvailable,
  runInBubblewrap,
} from "./sandbox/bubblewrap.js";

export interface ExecuteCommandArgs {
  command: string;
  timeout_seconds?: number;
  allow_network?: boolean;
  allow_env_secrets?: boolean;
}

export const executeCommandToolDefinition: MistralTool = {
  type: "function",
  function: {
    name: "execute_command",
    description:
      "Executes a shell command safely inside a native sandboxed environment (Linux namespaces via Bubblewrap). Confined strictly to the workspace directory with network disabled by default.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command line to execute inside the sandbox.",
        },
        timeout_seconds: {
          type: "integer",
          description:
            "Maximum execution time in seconds (default: 30, max: 120).",
        },
        allow_network: {
          type: "boolean",
          description:
            "Whether to allow network access. Defaults to false for security.",
        },
        allow_env_secrets: {
          type: "boolean",
          description:
            "Whether to expose workspace .env to the command. Defaults to false for security.",
        },
      },
      required: ["command"],
    },
  },
};

export async function executeExecuteCommand(
  args: ExecuteCommandArgs,
  workspaceDir: string = process.cwd(),
  onConfirm?: ConfirmCallback
): Promise<string> {
  if (!args || typeof args.command !== "string" || args.command.trim() === "") {
    return JSON.stringify({
      error: "The 'command' argument is required and must be a valid non-empty string.",
    });
  }

  const command = args.command.trim();

  if (!isBubblewrapAvailable()) {
    return JSON.stringify({
      error:
        "Bubblewrap sandbox engine ('bwrap') is not available or functional on this system (requires Linux with user namespace support). Command execution is blocked to fail closed.",
    });
  }

  if (!onConfirm) {
    return JSON.stringify({
      error: `Execution denied: Command '${command}' requires explicit user confirmation.`,
    });
  }

  const allowed = await onConfirm(`execute sandboxed command '${command}'`);
  if (!allowed) {
    return JSON.stringify({
      error: `Execution cancelled: The user denied permission to execute command '${command}'.`,
    });
  }

  const timeoutMs = Math.min(
    Math.max((args.timeout_seconds ?? 30) * 1000, 1000),
    120_000
  );

  try {
    const result = await runInBubblewrap(command, {
      workspaceDir,
      allowNetwork: Boolean(args.allow_network),
      allowEnvSecrets: Boolean(args.allow_env_secrets),
      timeoutMs,
    });

    return JSON.stringify({
      command,
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      timed_out: result.timedOut,
      truncated: result.truncated,
      sandboxed: result.sandboxed,
      engine: result.engine,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({
      error: `Sandbox execution failed: ${message}`,
    });
  }
}

export const executeCommandToolExecutor: ToolExecutor<ExecuteCommandArgs> = {
  definition: executeCommandToolDefinition,
  execute: executeExecuteCommand,
};
