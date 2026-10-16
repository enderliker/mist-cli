# AGENTS.md

Instructions, architecture principles, and developer conventions for AI agents working in this repository.

---

## 1. Project Overview

`mistral-cli` is a lightweight, interactive developer CLI powered by Mistral AI's `codestral-latest`. It allows developers to interact with Codestral from the terminal with native tool-calling capabilities to inspect, read, and write local project files safely.

### Technology Stack
- **Runtime**: Node.js 18+ (strictly ES Modules `"type": "module"`).
- **Language**: TypeScript (`NodeNext` module resolution, strict mode).
- **Core Dependencies**: `@mistralai/mistralai`, `dotenv`.
- **Test Runner**: Vitest (`tests/*.test.ts`).

---

## 2. Architecture Map

```text
src/
├── index.ts        # CLI entry point (shebang #!/usr/bin/env node)
├── cli.ts          # CLI argument parser, REPL interface, and one-shot runner
├── agent.ts        # CodestralAgent orchestrator and tool execution loop
├── config.ts       # Credential resolution (MISTRAL_API_KEY vs CODESTRAL_API_KEY)
└── tools/
    ├── types.ts    # Tool interfaces and Mistral schema definitions
    ├── read-file.ts # File reader with path traversal & sensitive file checks
    ├── list-files.ts# Workspace directory explorer
    ├── write-file.ts# Safe file writer with parent directory creation
    └── index.ts    # Tool registry and dispatcher
```

### Key Components

- **Configuration (`src/config.ts`)**:
  - Automatically resolves credentials:
    - If `CODESTRAL_API_KEY` is present: defaults endpoint to `https://codestral.mistral.ai`.
    - If `MISTRAL_API_KEY` is present: defaults endpoint to `https://api.mistral.ai`.
  - Supports CLI flag overrides (`-m / --model`, `-b / --base-url`).

- **Agent Loop (`src/agent.ts`)**:
  - Encapsulates chat history, system prompt, and tool execution.
  - Multi-step function calling loop runs up to `MAX_TOOL_ITERATIONS = 5`.
  - Dispatches tool calls via `executeTool()` and feeds results back to the model as `role: "tool"`.

- **Tool System (`src/tools/`)**:
  - Every tool exports a `ToolDefinition` implementing `name`, `description`, `parameters`, and `execute`.
  - Tools must return user-friendly strings instead of throwing raw exceptions.
  - `src/tools/index.ts` serves as the central registry.

---

## 3. Security Invariants & Guardrails

All modifications to tools and CLI interactions must adhere to these security requirements:

1. **Path Traversal Prevention**:
   - Every file operation must resolve target paths against `workspaceDir` using `path.resolve()`.
   - Target paths must strictly begin with `workspaceDir`. Attempts to access files outside the workspace root must be rejected immediately.

2. **Sensitive File Authorization**:
   - Any read operation targeting sensitive files (`.env`, `*.pem`, `*.key`, `id_rsa*`) must trigger `onConfirmAction()`.
   - In non-TTY environments (CI, piped stdin) or if user declines, access must be denied.

3. **Context Safeguards**:
   - File reading has an enforced size limit (100 KB) to prevent exhausting model token limits.
   - Directory listing automatically ignores noisy directories (`node_modules`, `.git`, `dist`, `.gemini`).

---

## 4. Development & Coding Conventions

- **Language**: All code comments, documentation, test descriptions, and git commits must be written in **English**.
- **No Redundant Comments**: Avoid comments that only restate what the code plainly expresses. Keep docstrings and architectural notes only where non-obvious intent exists.
- **Error Handling**: Use typed guards, return descriptive error strings from tools, and keep process termination confined to CLI entry points.
- **Strict ESM**: Never use CommonJS (`require`, `module.exports`, `__dirname`). Use ESM imports with `.js` extensions for relative TypeScript imports.

---

## 5. Testing & Verification

- Test coverage is managed via **Vitest**.
- Every new tool or behavioral change must include corresponding unit tests in `tests/`.
- Verify code integrity before completing any task:
  ```bash
  # Compile TypeScript to verify types
  npm run build

  # Run full test suite
  npm test
  ```
