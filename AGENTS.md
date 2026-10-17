# AGENTS.md

Instructions, architecture principles, and developer conventions for AI agents working in this repository.

---

## 1. Project Overview

`mist-cli` (binary aliases `mist` and `mist-cli`) is a high-performance, interactive developer CLI powered by Mistral AI's `codestral-latest`. Written entirely in native Rust, it enables developers to converse with Codestral from the terminal with native tool-calling capabilities to inspect, search, read, surgically edit, and safely execute commands inside an isolated Linux namespace sandbox.

### Technology Stack
- **Language**: Rust (Edition 2021).
- **Workspace Architecture**: Cargo multi-crate workspace.
  - `crates/mistral-client`: Standalone native HTTP client SDK for Mistral AI / Codestral APIs.
  - `crates/mist-cli`: Main CLI application (agent loop, tool registry, Ratatui TUI & fallback REPL).
- **Core Dependencies**: `ratatui`, `crossterm`, `clap`, `tokio`, `serde`, `serde_json`, `rustyline`, `dotenvy`.
- **Test Runner**: Built-in Rust test framework (`cargo test`) with `wiremock` and `tempfile`.

---

## 2. Architecture Map

```text
crates/
├── mistral-client/       # Native Rust Mistral API client SDK
│   ├── Cargo.toml        # Crate configuration
│   ├── src/
│   │   ├── lib.rs        # SDK entrypoint
│   │   ├── client.rs     # MistralClient and ChatClient
│   │   ├── models.rs     # ChatMessage, Role, ToolCall, ChatCompletionRequest/Response
│   │   └── error.rs      # Strongly-typed MistralError
│   └── tests/            # Unit and WireMock integration tests (12 tests)
└── mist-cli/             # Native Rust CLI application
    ├── Cargo.toml        # Crate configuration (bins: mist, mist-cli)
    ├── src/
    │   ├── main.rs       # Primary entrypoint (mist-cli)
    │   ├── bin/
    │   │   └── mist.rs   # Short alias entrypoint (mist)
    │   ├── lib.rs        # Library interface (cli, agent, config, tools, ui)
    │   ├── cli.rs        # CLI argument parser (clap), one-shot runner, TUI/REPL dispatcher
    │   ├── config.rs     # Credential resolution (MISTRAL_API_KEY vs CODESTRAL_API_KEY)
    │   ├── agent.rs      # CodestralAgent orchestrator and tool execution loop
    │   ├── tools/
    │   │   ├── types.rs           # Tool interfaces, ToolError, and path traversal guards
    │   │   ├── read_file.rs       # File reader with path traversal & sensitive file checks
    │   │   ├── list_files.rs      # Workspace directory explorer with noise filtering
    │   │   ├── write_file.rs      # Safe file writer with parent directory creation
    │   │   ├── edit_file.rs       # Exact-match surgical search & replace editor
    │   │   ├── search_files.rs    # Regex and pattern workspace search with line numbering
    │   │   ├── execute_command.rs # Sandboxed Linux command runner
    │   │   ├── web_search.rs      # Real-time web search tool via Tavily API
    │   │   ├── fetch_web_page.rs  # HTML-to-markdown web content extractor
    │   │   ├── sandbox/
    │   │   │   └── bubblewrap.rs  # Linux namespace sandbox engine (bwrap)
    │   │   └── registry.rs        # Tool trait & unified ToolRegistry dispatcher
    │   └── ui/           # Ratatui interactive TUI
    │       ├── mod.rs             # TerminalGuard, event loop, and redraw gating
    │       ├── app.rs             # App state machine and action handler
    │       └── components/        # Header, MessageList, InputBar, SecurityPrompt, StatusBar
    └── tests/            # Integration, unit, and performance tests (29 tests)
```

### Key Components

- **Configuration (`crates/mist-cli/src/config.rs`)**:
  - Automatically resolves credentials:
    - If `CODESTRAL_API_KEY` is present: defaults endpoint to `https://codestral.mistral.ai`.
    - If `MISTRAL_API_KEY` is present: defaults endpoint to `https://api.mistral.ai`.
  - Supports CLI flag and environment variable overrides (`-m / --model`, `-b / --base-url`).

- **Agent Loop (`crates/mist-cli/src/agent.rs`)**:
  - Encapsulates chat history, dynamic system prompt, and tool execution.
  - Multi-step function calling loop runs up to `MAX_TOOL_ITERATIONS = 5`.
  - Dispatches tool calls via `ToolRegistry::execute_tool()` and feeds results back to the model as `role: "tool"`.
  - Implements sliding window message history pruning (`max_history_messages`) while preserving turn boundaries.

- **Tool System (`crates/mist-cli/src/tools/`)**:
  - Every tool implements the `Tool` trait exporting `name()`, `description()`, `parameters()`, and `execute()`.
  - Tools return descriptive error types and user-friendly strings without panicking.
  - `registry.rs` serves as the central registry and generates Mistral tool definitions.

- **Interactive TUI (`crates/mist-cli/src/ui/`)**:
  - Built with `ratatui` and `crossterm`.
  - Zero idle CPU overhead: event loop waits on blocking `crossterm::event::read()` with dirty-state redraw gating.
  - Interactive security modal dialog for authorization confirmation.

---

## 3. Security Invariants & Guardrails

All modifications to tools and CLI interactions must adhere strictly to these security requirements:

1. **Path Traversal Prevention**:
   - Every file operation must resolve target paths against `workspace_dir` using `is_path_inside()`.
   - Attempts to access files outside the workspace root must be rejected immediately with `ToolError::PathTraversal`.

2. **Native OS Sandboxing (Bubblewrap)**:
   - Any shell command execution via `execute_command` must run strictly confined through Bubblewrap (`bwrap`).
   - Read-only system paths (`/usr`, `/lib`, `/bin`, `/lib64`, `/etc`), isolated `/tmp` (tmpfs), and `--unshare-all` namespace isolation.
   - Network access is disabled by default unless explicitly granted with `allow_network: true`.
   - Host files outside `workspace_dir` (e.g. `~/.ssh`, `/root`, other home folders) are completely inaccessible.

3. **Sensitive File & Action Authorization**:
   - Any read operation targeting sensitive files (`.env`, `*.pem`, `*.key`, `id_rsa*`) or any sandboxed command execution must trigger `on_confirm()`.
   - In non-TTY environments (CI, piped stdin) or if user declines, access/execution must be denied.

4. **Context Safeguards**:
   - File reading has an enforced size limit (100 KB) to prevent exhausting model token limits.
   - Command output is capped at 50 KB to protect the conversation context.
   - Directory listing automatically ignores noisy directories (`target`, `.git`, `.gemini`, `node_modules`).

---

## 4. Development & Coding Conventions

- **Language**: All code comments, documentation, test descriptions, and git commits must be written in **English**.
- **No Redundant Comments**: Avoid comments that only restate what the code plainly expresses. Keep docstrings and architectural notes only where non-obvious intent exists.
- **Error Handling**: Use strongly-typed `thiserror` enums and avoid `unwrap()` or `expect()` in library and tool code.
- **Pure Rust Workspace**: Do not introduce Node.js or npm dependencies into this repository.

---

## 5. Testing & Verification

- Test coverage is managed via Cargo test suites:
  - `crates/mistral-client/tests/`: Client, serialization, and WireMock tests (12 tests).
  - `crates/mist-cli/tests/`: Config, sandbox, filesystem, network, registry, agent, CLI, and TUI tests (29 tests).
- Verify code integrity before completing any task:
  ```bash
  # Check compilation across all crates
  cargo check --workspace

  # Run all unit, integration, and UI tests
  cargo test

  # Build optimized release binaries
  cargo build --release
  ```
