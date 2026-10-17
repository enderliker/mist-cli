# Mistral Codestral CLI

Lightweight, interactive CLI for developers powered by **Codestral** (`codestral-latest`), Mistral AI's specialized code generation and reasoning model.

Equipped with an autonomous agent and native function calling to inspect, read, create files, and safely execute commands directly within a native sandboxed environment.

---

## Features

- **Codestral Native Tool Calling**: Powered by `codestral-latest` with autonomous multi-step reasoning.
- **Dual Endpoint Auto-Resolution**:
  - `MISTRAL_API_KEY` connects to `https://api.mistral.ai`.
  - `CODESTRAL_API_KEY` connects to `https://codestral.mistral.ai`.
- **Local Workspace & Web Tools**:
  - `list_files`: Inspect workspace file trees and directory structures with automated exclusion of noise directories (`node_modules`, `.git`, `dist`).
  - `read_file`: Read entire files or specific line slices with a 100 KB safety limit.
  - `write_file`: Create new project files or assets with recursive parent directory creation.
  - `edit_file`: Surgically replace target text blocks in existing files with character-exact match verification.
  - `search_files`: Fast codebase grep and regex pattern search across workspace files with line numbering.
  - `execute_command`: Run shell commands and tests inside an isolated Linux namespace sandbox (Bubblewrap).
  - `web_search`: Search the live web for up-to-date documentation, APIs, and technical references via Tavily API.
  - `fetch_web_page`: Extract readable text and markdown content from web documentation URLs.
- **Modern Ink React-based TUI**: Rich terminal interface with flexbox layout, live input cursor, animated thinking spinner, and interactive security dialogs.
- **Security & Guardrails**:
  - **Native OS Sandboxing (Bubblewrap)**: Commands run in unprivileged Linux namespaces (`bwrap`) with read-only system mounts, isolated `/tmp`, network unshared by default, and strict containment to the workspace.
  - Path traversal protection restricting all operations to the workspace root.
  - Interactive confirmation prompts before accessing sensitive files (`.env`, `.pem`, `.key`, `id_rsa*`) or executing sandboxed commands.
  - Automatic denial in non-TTY / CI environments to avoid secret leakage or unintended execution.
- **One-Shot & REPL Modes**: Execute immediate single-turn commands or run an interactive session with conversation context.

---

## Requirements

- **Operating System**: Linux (for Bubblewrap sandboxing) or any OS with Node.js.
- **Bubblewrap**: `bwrap` (typically pre-installed on Linux, or via `sudo apt install bubblewrap`).
- **Node.js**: v18.0.0 or higher (native ESM support).
- **npm**: v9.0.0 or higher.
- A Mistral AI API key ([console.mistral.ai](https://console.mistral.ai/)) or Codestral dedicated key ([codestral.mistral.ai](https://codestral.mistral.ai/)).

---

## Installation & Setup

1. Clone repository and install dependencies:
   ```bash
   git clone <repo-url>
   cd mistral-cli
   npm install
   ```

2. Build TypeScript to JavaScript ESM:
   ```bash
   npm run build
   ```

3. (Optional) Link binary globally:
   ```bash
   npm link
   # mistral-cli is now globally accessible
   mistral-cli --help
   ```

---

## Configuration

Create a `.env` file in the project root or working directory:

```bash
cp .env.example .env
```

Configure your preferred API key:

```env
# Standard Mistral AI key
MISTRAL_API_KEY=your_mistral_api_key

# Or dedicated Codestral key
# CODESTRAL_API_KEY=your_codestral_api_key

# Optional overrides
# MISTRAL_MODEL=codestral-latest
# MISTRAL_BASE_URL=https://api.mistral.ai
```

You can also export the environment variable directly:
```bash
export MISTRAL_API_KEY="your_api_key"
```

---

## Usage

### 1. One-Shot Mode

Pass a query directly as command-line arguments:

```bash
mistral-cli "What scripts and dependencies are defined in package.json?"
```

```bash
mistral-cli -m codestral-2501 "Explain how authentication is resolved in src/config.ts"
```

### 2. Interactive REPL Mode

Launch the REPL without arguments:

```bash
mistral-cli
```

Example session:
```text
============================================================
Mistral Codestral CLI (v0.2.0-beta.1)
Active Model: codestral-latest
Endpoint:     https://api.mistral.ai
Workspace:    /home/user/project
Type your prompt, or use /help, /clear, or /exit.
============================================================

codestral> run npm test in the sandbox
⚠️  [Security] Codestral requests permission to execute sandboxed command 'npm test'. Authorize? (y/N): y
[Tool] Executing 'execute_command' with arguments: { command: 'npm test' }
[Tool] 'execute_command' completed.

The test suite ran successfully:
- 8 test files passed
- 58 tests passed

codestral> can you read .env?
⚠️  [Security] Codestral requests permission to read sensitive file '.env'. Authorize? (y/N): y
[Tool] Executing 'read_file' with arguments: { path: '.env' }
[Tool] 'read_file' completed.

codestral> /history
Total messages in history: 5

codestral> /clear
Conversation history cleared.

codestral> /exit
Goodbye!
```

### Running the Native Rust CLI
You can also run the native Rust binary directly:

```bash
# Build the Rust CLI binary
cargo build --package mistral-cli --release

# Run one-shot mode via cargo
cargo run --package mistral-cli -- "What does src/config.ts do?"

# Start the interactive Rust REPL
cargo run --package mistral-cli
```

---

## REPL Commands

| Command | Action |
|---|---|
| `/help` | Display interactive command overview |
| `/clear` | Reset chat history (retains system prompt) |
| `/history` | Print the number of messages in memory |
| `/exit` or `/quit` | Terminate session |

---

## Development & Testing

Run unit and integration tests across both ecosystems:

```bash
# Run all TypeScript tests (118 tests)
npm test

# Run all Rust tests (40 tests across mistral-client and mistral-cli)
cargo test
```

---

## Project Structure

```text
mistral-cli/
├── packages/
│   └── cli/                  # TypeScript CLI package (Ink TUI & Agent)
│       ├── src/              # CLI entrypoint, agent loop, tools, and UI
│       ├── tests/            # Vitest test suites (118 tests)
│       ├── package.json      # CLI dependencies (Ink, React, Mistral)
│       └── tsconfig.json     # NodeNext TypeScript configuration
├── crates/
│   ├── mistral-client/       # Native Rust Mistral API SDK
│   │   ├── src/              # Client, Models, and Error handling
│   │   ├── tests/            # WireMock and serialization test suites (12 tests)
│   │   └── Cargo.toml        # Rust dependencies (reqwest, serde, tokio)
│   └── mistral-cli/          # Native Rust CLI application (Agent, Tools, Ratatui TUI & REPL)
│       ├── src/              # Agent orchestrator, tools, config, CLI, TUI and REPL
│       ├── tests/            # Integration and unit tests (28 tests)
│       └── Cargo.toml        # Binary crate configuration
├── Cargo.toml                # Root Cargo workspace coordinator
├── package.json              # Root npm workspace coordinator
└── README.md
```

---

## License

MIT
