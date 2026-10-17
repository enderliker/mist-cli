# Implementation Plan: Rust CLI Migration (`crates/mistral-cli`)

## Overview
Port the developer CLI from TypeScript (`packages/cli`) to a native, high-performance Rust binary crate (`crates/mistral-cli`) in the Cargo workspace. The crate builds on `crates/mistral-client` and implements the full developer tool suite, native Bubblewrap Linux sandboxing, autonomous multi-step agent loop, CLI flags (`clap`), and an interactive terminal REPL (`rustyline` + `colored`).

## Architecture Decisions

### 1. Workspace Integration
- Add `"crates/mistral-cli"` to root `Cargo.toml` members.
- `mistral-cli` depends locally on `mistral-client = { path = "../mistral-client" }`.
- Cargo workspace enables running `cargo test` and `cargo build` across the entire project from root.

### 2. Native Sandboxing & Security Parity
- **Linux Bubblewrap (`bwrap`) Engine**:
  - Unshared namespaces: `--unshare-all`.
  - Read-only system paths: `/usr`, `/lib`, `/bin`, `/lib64`, `/etc` (filtered).
  - Tmpfs on `/tmp`.
  - Strict bind mount of `workspace_dir` only.
  - Network isolation unless `allow_network = true`.
- **Sensitive File Authorization**:
  - `on_confirm` callback triggered before reading or writing `.env`, `.pem`, `.key`, `id_rsa*` or running sandboxed commands.
  - Non-TTY / CI fail closed.

### 3. Tool Architecture
- `Tool` trait defining `name()`, `description()`, `parameters() -> serde_json::Value`, and `execute(args: Value, workspace_dir: &Path, on_confirm: &Option<ConfirmCallback>) -> Result<String, ToolError>`.
- `ToolRegistry` managing dynamic lookup and generating `Vec<mistral_client::models::Tool>` for API requests.

### 4. Interactive Terminal REPL
- Powered by `rustyline` with history persistence, ANSI colors via `colored`, and command interception (`/help`, `/clear`, `/history`, `/exit`).
- Interactive modal confirmation for sensitive operations: `[y]/[n]` prompts directly in the terminal interface.

---

## Dependency Graph

```
crates/mistral-client (SDK)
    │
    └── crates/mistral-cli (Binary Crate)
            │
            ├── config (Credential & endpoint resolution)
            │
            ├── tools/sandbox (Bubblewrap bwrap runner)
            │       │
            │       └── tools (read, write, edit, list, search, execute, web_search, fetch)
            │               │
            │               └── agent (CodestralAgent loop, system prompt, sliding window)
            │                       │
            │                       └── cli / main (Clap flags, REPL, One-shot)
```

---

## Task List

### Phase 7.1: Crate Setup & Configuration
- [ ] Task 18: Initialize `crates/mistral-cli` crate and implement `config.rs`.

### Phase 7.2: Sandbox Engine & Filesystem Tools
- [ ] Task 19: Implement Linux Bubblewrap sandbox engine (`tools/sandbox/bubblewrap.rs`).
- [ ] Task 20: Implement core filesystem tools (`read_file`, `write_file`, `edit_file`, `list_files`, `search_files`).

### Checkpoint: Filesystem & Sandbox Parity
- [ ] Sandbox and filesystem tool tests pass cleanly.

### Phase 7.3: Network Tools & Tool Registry
- [ ] Task 21: Implement network tools (`execute_command`, `web_search`, `fetch_web_page`).
- [ ] Task 22: Implement `ToolRegistry` and unified tool dispatcher.

### Checkpoint: Complete Tool System
- [ ] All 8 tools pass unit tests and register correctly.

### Phase 7.4: Agent Loop & Orchestration
- [ ] Task 23: Implement `CodestralAgent` (prompt builder, tool loop, sliding window history).

### Phase 7.5: CLI Interface & Interactive REPL
- [ ] Task 24: Implement CLI argument parsing (`clap`), one-shot runner, and interactive REPL (`rustyline`).

### Phase 7.6: Documentation & Validation
- [ ] Task 25: Update documentation (`README.md`, `AGENTS.md`) and run full cross-crate test suite.

### Checkpoint: Complete Migration
- [ ] `cargo test` passes across all crates.
- [ ] `cargo run --package mistral-cli -- --help` and `--version` work.
- [ ] One-shot and REPL execution verified end-to-end.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Systems without `bwrap` installed | Medium | Detect `bwrap` availability early; return clear, descriptive error instructions if missing on Linux. |
| Non-Linux operating systems | Low | Bubblewrap is Linux-specific; on macOS/Windows, execute commands with standard process execution or document Linux requirement. |
| Tool JSON schema mismatches | High | Verify each tool's generated JSON schema matches Mistral function calling format using exact unit tests. |
| Context exhaustion during multi-turn chats | High | Port the sliding window message pruning algorithm to keep history bounded. |
