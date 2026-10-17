# Spec: Rust CLI Migration (`crates/mistral-cli`)

## Objective
Migrate the complete developer CLI application from TypeScript (`packages/cli`) to a high-performance, single-binary Rust implementation (`crates/mistral-cli`). The new CLI will utilize our native SDK crate (`crates/mistral-client`) and provide feature parity with all existing capabilities: 8 developer tools, Linux Bubblewrap sandboxing, interactive REPL, one-shot prompt execution, and strict security invariants.

## Capability Map

| Module / Area | Responsibility | Depends on |
|---|---|---|
| `config` | Environment credential detection (`MISTRAL_API_KEY` vs `CODESTRAL_API_KEY`), endpoint overrides, model defaults | — |
| `tools::sandbox` | Linux namespace sandbox runner using Bubblewrap (`bwrap`) with path and network isolation | — |
| `tools` | 8 developer tools (`read_file`, `write_file`, `edit_file`, `list_files`, `search_files`, `execute_command`, `web_search`, `fetch_web_page`) + registry | `tools::sandbox`, `config` |
| `agent` | `CodestralAgent` multi-step tool calling loop, dynamic system prompt, sliding window history pruning, action authorization callbacks | `mistral-client`, `tools`, `config` |
| `cli` / `main` | CLI argument parsing (`clap`), one-shot runner, interactive REPL (`rustyline` / terminal prompts), security confirmation modals | `agent`, `config` |

**Build & Implementation Order:**
`config` → `tools::sandbox` → `tools` → `agent` → `cli / main`

---

## Tech Stack
- **Language**: Rust (Edition 2021).
- **Core Crate**: `crates/mistral-cli` (binary crate in root Cargo workspace).
- **Internal SDK**: `mistral-client = { path = "../mistral-client" }`.
- **Key Dependencies**:
  - `clap`: CLI argument parsing with `derive` feature (`--model`, `--base-url`, `--version`, `--help`).
  - `tokio`: Async runtime (`features = ["full"]`).
  - `serde`, `serde_json`: JSON serialization and deserialization.
  - `reqwest`: HTTP client (for `web_search` via Tavily and `fetch_web_page`).
  - `dotenvy`: `.env` file environment loading.
  - `regex`: Workspace grep and regex pattern matching in `search_files`.
  - `colored`: Terminal ANSI color formatting for REPL and output styling.
  - `rustyline`: Interactive terminal REPL line editor.
  - `wiremock`: Dev-dependency for testing HTTP-based tools and agent integration.

---

## Commands
```bash
# Build the Rust CLI binary
cargo build --package mistral-cli

# Run all test suites across the workspace
cargo test

# Run only the CLI test suite
cargo test --package mistral-cli

# Run the CLI binary directly
cargo run --package mistral-cli -- --help
cargo run --package mistral-cli -- "What files are in this project?"
```

---

## Project Structure
```text
crates/mistral-cli/
├── Cargo.toml
├── src/
│   ├── main.rs               # Binary entry point and exit code handling
│   ├── cli.rs                # CLI flags (clap), one-shot execution, interactive REPL loop
│   ├── config.rs             # Credential resolution (MISTRAL_API_KEY vs CODESTRAL_API_KEY)
│   ├── agent.rs              # CodestralAgent orchestrator and tool execution loop
│   └── tools/
│       ├── mod.rs            # Tool trait, ToolRegistry, and dispatcher
│       ├── types.rs          # ConfirmCallback and Tool interfaces
│       ├── read_file.rs      # File reader with line slicing, traversal & sensitive checks
│       ├── write_file.rs     # File writer with sensitive file authorization
│       ├── edit_file.rs      # Surgical search & replace editor
│       ├── list_files.rs     # Directory explorer with noise filtering
│       ├── search_files.rs   # Workspace grep and code pattern search
│       ├── execute_command.rs# Command execution tool
│       ├── web_search.rs     # Real-time web search tool via Tavily API
│       ├── fetch_web_page.rs # Web page text extractor
│       └── sandbox/
│           ├── mod.rs
│           └── bubblewrap.rs # Linux namespace sandbox engine (bwrap)
└── tests/                    # Integration and unit tests
    ├── config_test.rs
    ├── tools_file_test.rs
    ├── tools_search_test.rs
    ├── sandbox_test.rs
    ├── web_tools_test.rs
    ├── agent_test.rs
    └── cli_test.rs
```

---

## Code Style & Conventions
- **Idiomatic Rust**: Explicit error handling via `Result<T, E>` and `thiserror`, no unwrap in production logic.
- **English Only**: All comments, docstrings, and log messages in English.
- **Minimal Dependencies**: Use standard library primitives where possible.
- **Fail Closed**: Path traversal attempts, sensitive file modifications without confirmation, and unauthorized command executions fail closed immediately.

---

## Testing Strategy
- **Unit Tests**:
  - `config_test.rs`: Auto-detection of API keys, custom endpoints, overrides.
  - `tools_file_test.rs`: `read_file`, `write_file`, `edit_file`, and sensitive file protections (`.env`, `*.key`, etc.).
  - `tools_search_test.rs`: `list_files` noise filtering, `search_files` regex matching and line numbers.
  - `sandbox_test.rs`: Bubblewrap CLI args construction, path isolation, and command execution.
  - `web_tools_test.rs`: Mocked Tavily search and fetch responses.
- **Integration Tests**:
  - `agent_test.rs`: Multi-step function calling loop with mocked Mistral API (`wiremock`), max iterations cap, and history pruning.
  - `cli_test.rs`: Flag parsing, one-shot argument handling.

---

## Boundaries
- **Always do**:
  - Verify target paths strictly begin with `workspace_dir` using canonicalize/path resolution.
  - Require user authorization via `on_confirm` before reading or writing sensitive files (`.env`, `*.pem`, `*.key`, `id_rsa*`) or executing shell commands.
  - Run shell commands inside Bubblewrap (`bwrap`) on Linux with unshared namespaces.
- **Ask first**:
  - Adding heavy third-party crates or native C dependencies beyond standard Rust libraries.
  - Deprecating or removing `packages/cli` (TypeScript CLI) before the Rust CLI is fully validated.
- **Never do**:
  - Bypass sandbox flags (`--unshare-all`, read-only mounts).
  - Allow access to host files outside workspace root.
  - Panic or call `unwrap()` in tool execution code.

---

## Success Criteria
1. `crates/mistral-cli` compiles into a standalone binary `mistral-cli` with zero compiler warnings.
2. All 8 developer tools are implemented in Rust with parity to TypeScript behavior and verified with unit tests.
3. Native Bubblewrap sandboxing executes commands safely with network and filesystem containment.
4. `CodestralAgent` successfully connects to Codestral / Mistral APIs via `mistral-client`, completes multi-step function calling loops, and handles interactive prompts.
5. `cargo test` runs all tests cleanly across both `mistral-client` and `mistral-cli`.
6. Interactive REPL and one-shot CLI commands work with identical user experience to the TypeScript CLI.

---

## Open Questions & Decisions
1. **REPL vs Full TUI**:
   - The TypeScript CLI has an Ink React TUI. For Rust, an interactive REPL with `rustyline` + `colored` provides clean, reliable, terminal-native interactive sessions without the high complexity of a full Ratatui TUI state machine. Does this match your preference, or do you want a full Ratatui TUI later?
   *(Recommendation: Start with rich interactive REPL with color formatting; Ratatui can be added incrementally if needed).*
