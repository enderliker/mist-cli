# Task List: Rust CLI Migration (`crates/mistral-cli`)

## Phase 7: Rust CLI Migration

### Task 18: Initialize `crates/mistral-cli` crate and implement `config.rs`

**Description:** Set up the binary crate `crates/mistral-cli`, configure dependencies in `Cargo.toml`, register the crate in root workspace `Cargo.toml`, and implement configuration resolution (`config.rs`) for `MISTRAL_API_KEY` vs `CODESTRAL_API_KEY`.

**Acceptance criteria:**
- [x] Root `Cargo.toml` includes `"crates/mistral-cli"` in members.
- [x] `crates/mistral-cli/Cargo.toml` declares dependencies on `mistral-client`, `clap`, `tokio`, `serde`, `serde_json`, `dotenvy`, `thiserror`, `colored`, `rustyline`, `regex`, and `reqwest`.
- [x] `config.rs` resolves credentials, sets endpoints (`api.mistral.ai` vs `codestral.mistral.ai`), and supports environment/flag overrides.
- [x] Unit tests in `tests/config_test.rs` verify API key detection and endpoint defaults.

**Verification:**
- [x] `cargo test --package mistral-cli --test config_test`

**Dependencies:** None

**Files likely touched:**
- `Cargo.toml`
- `crates/mistral-cli/Cargo.toml`
- `crates/mistral-cli/src/config.rs`
- `crates/mistral-cli/tests/config_test.rs`

**Estimated scope:** Small: 4 files

---

### Task 19: Implement Linux Bubblewrap sandbox engine (`tools/sandbox/bubblewrap.rs`)

**Description:** Port the Bubblewrap sandbox engine to Rust, implementing isolated process execution with unshared namespaces, read-only system paths, isolated `/tmp`, workspace binding, and network gating.

**Acceptance criteria:**
- [x] `BubblewrapEngine` constructs `bwrap` command-line arguments adhering to all security flags (`--unshare-all`, `--ro-bind`, `--tmpfs /tmp`, `--bind <workspace>`, `--dev /dev`, `--proc /proc`).
- [x] Network access disabled by default; enabled only when `allow_network: true` (omitting `--unshare-net`).
- [x] Output is capped at 50 KB to safeguard model context.
- [x] Unit tests in `tests/sandbox_test.rs` verify argument generation and sandboxed command execution.

**Verification:**
- [x] `cargo test --package mistral-cli --test sandbox_test`

**Dependencies:** Task 18

**Files likely touched:**
- `crates/mistral-cli/src/tools/sandbox/mod.rs`
- `crates/mistral-cli/src/tools/sandbox/bubblewrap.rs`
- `crates/mistral-cli/tests/sandbox_test.rs`

**Estimated scope:** Small: 3 files

---

### Task 20: Implement core filesystem tools (`read_file`, `write_file`, `edit_file`, `list_files`, `search_files`)

**Description:** Implement local file exploration, reading, writing, surgical editing, and workspace search in Rust with path traversal protection, sensitive file authorization, and noise directory filtering.

**Acceptance criteria:**
- [x] `read_file`: Line range reading, 100 KB limit, path traversal rejection, sensitive file confirmation (`.env`, `*.key`, `*.pem`, `id_rsa*`).
- [x] `write_file`: Path traversal rejection, intermediate directory creation, sensitive file authorization.
- [x] `edit_file`: Exact character matching, expected matches verification, atomic write, sensitive file authorization.
- [x] `list_files`: Recursive file tree, automated noise directory exclusion (`node_modules`, `.git`, `dist`, `.gemini`, `target`).
- [x] `search_files`: Regex and literal search, line numbering, pattern filtering, noise directory exclusion, result capping.
- [x] Unit tests in `tests/tools_file_test.rs` and `tests/tools_search_test.rs` verify functionality.

**Verification:**
- [x] `cargo test --package mistral-cli --test tools_file_test`
- [x] `cargo test --package mistral-cli --test tools_search_test`

**Dependencies:** Task 19

**Files likely touched:**
- `crates/mistral-cli/src/tools/read_file.rs`
- `crates/mistral-cli/src/tools/write_file.rs`
- `crates/mistral-cli/src/tools/edit_file.rs`
- `crates/mistral-cli/src/tools/list_files.rs`
- `crates/mistral-cli/src/tools/search_files.rs`
- `crates/mistral-cli/tests/tools_file_test.rs`
- `crates/mistral-cli/tests/tools_search_test.rs`

**Estimated scope:** Medium: 7 files

---

### Checkpoint: Filesystem & Sandbox Parity
- [x] All filesystem and sandbox tests pass cleanly: `cargo test --package mistral-cli --test sandbox_test --test tools_file_test --test tools_search_test`

---

### Task 21: Implement network tools (`execute_command`, `web_search`, `fetch_web_page`)

**Description:** Implement the sandboxed shell execution tool, real-time web search tool via Tavily API, and HTML-to-markdown web content extractor.

**Acceptance criteria:**
- [x] `execute_command`: Requires explicit user confirmation via `on_confirm`, runs inside Bubblewrap sandbox, respects `allow_network`.
- [x] `web_search`: Queries Tavily Search API (`api.tavily.com/search`), formats results into structured Markdown.
- [x] `fetch_web_page`: Fetches URL content with 15s timeout, extracts readable text/markdown, enforces 20,000 char safety limit, falls back gracefully if Tavily extract is unavailable.
- [x] Unit and mock tests in `tests/tools_network_test.rs`.

**Verification:**
- [x] `cargo test --package mistral-cli --test tools_network_test`

**Dependencies:** Task 20

**Files likely touched:**
- `crates/mistral-cli/src/tools/execute_command.rs`
- `crates/mistral-cli/src/tools/web_search.rs`
- `crates/mistral-cli/src/tools/fetch_web_page.rs`
- `crates/mistral-cli/tests/tools_network_test.rs`

**Estimated scope:** Medium: 4 files

---

### Task 22: Implement `ToolRegistry` and unified tool dispatcher

**Description:** Build the central registry managing tool metadata definitions and dispatching execution calls from the agent loop.

**Acceptance criteria:**
- [x] `Tool` trait implemented for all 8 tools with Mistral function schema definitions.
- [x] `ToolRegistry::new_default()` registers all 8 tools.
- [x] `execute_tool(name, args, workspace, confirm)` correctly routes to the registered executor.
- [x] `get_tool_definitions()` returns all tools as `Vec<mistral_client::models::Tool>`.
- [x] Unit tests verify registry dispatching.

**Verification:**
- [x] `cargo test --package mistral-cli --test tools_registry_test`

**Dependencies:** Task 21

**Files likely touched:**
- `crates/mistral-cli/src/tools/mod.rs`
- `crates/mistral-cli/src/tools/types.rs`
- `crates/mistral-cli/tests/tools_registry_test.rs`

**Estimated scope:** Small: 3 files

---

### Checkpoint: Complete Tool System
- [x] All tool test suites pass cleanly across all 8 tools.

---

### Task 23: Implement `CodestralAgent` (prompt builder, tool loop, sliding window history)

**Description:** Port the `CodestralAgent` orchestrator to Rust, implementing dynamic environment system prompts, multi-step function calling loop up to 5 iterations, and sliding window message history pruning.

**Acceptance criteria:**
- [x] `build_system_prompt()` includes current date, time, timezone, platform, and guidelines.
- [x] `CodestralAgent::chat()` executes function calling loop, invoking `ToolRegistry` and feeding results back as role `tool`.
- [x] Sliding window history pruning limits messages to `max_history_messages` (default 30) while preserving system prompt and turn boundaries.
- [x] Integration tests in `tests/agent_test.rs` using `wiremock` verify multi-turn interactions and tool calls.

**Verification:**
- [x] `cargo test --package mistral-cli --test agent_test`

**Dependencies:** Task 22

**Files likely touched:**
- `crates/mistral-cli/src/agent.rs`
- `crates/mistral-cli/tests/agent_test.rs`

**Estimated scope:** Small: 2 files

---

### Task 24: Implement CLI argument parsing (`clap`), one-shot runner, and interactive REPL (`rustyline`)

**Description:** Implement the main CLI executable with `clap` command-line flags, one-shot prompt execution, interactive REPL loop with `rustyline`, ANSI colors, command handling (`/help`, `/clear`, `/history`, `/exit`), and interactive confirmation dialogs.

**Acceptance criteria:**
- [x] `clap` derives `--help`, `--version`, `-m / --model`, `-b / --base-url`, and optional `prompt` positional argument.
- [x] One-shot mode runs if `prompt` argument is provided or stdin is piped; exits with status code 0 on success, 1 on error.
- [x] Interactive REPL starts when run in a TTY without arguments; handles `/help`, `/clear`, `/history`, `/exit`.
- [x] Interactive security prompts prompt user `[y]/[n]` before executing sandboxed commands or accessing sensitive files.

**Verification:**
- [x] `cargo test --package mistral-cli --test cli_test`
- [x] Manual check: `cargo run --package mistral-cli -- --help`
- [x] Manual check: `cargo run --package mistral-cli -- --version`

**Dependencies:** Task 23

**Files likely touched:**
- `crates/mistral-cli/src/cli.rs`
- `crates/mistral-cli/src/main.rs`
- `crates/mistral-cli/tests/cli_test.rs`

**Estimated scope:** Small: 3 files

---

### Task 25: Update documentation and validate cross-crate test suite

**Description:** Update `README.md` and `AGENTS.md` to document the new Rust CLI commands, configuration, and architecture, and verify the full test suite passes across the entire workspace.

**Acceptance criteria:**
- [x] `AGENTS.md` and `README.md` updated with Rust CLI documentation and build instructions.
- [x] All tests across both `mistral-client` and `mistral-cli` pass cleanly with zero compiler warnings.
- [x] TypeScript test suite remains green in `packages/cli`.

**Verification:**
- [x] `cargo test`
- [x] `npm test`
- [x] `cargo build --package mistral-cli`

**Dependencies:** Task 24

**Files likely touched:**
- `AGENTS.md`
- `README.md`

**Estimated scope:** Small: 2 files

---

### Checkpoint: Complete Migration
- [x] All test suites green across all crates and packages.
- [x] Rust binary ready and verified.
