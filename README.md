# mist-cli (`mist`)

[![CI](https://github.com/enderliker/mist-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/enderliker/mist-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

High-performance, interactive developer CLI powered by **Codestral** (`codestral-latest`), Mistral AI's specialized code generation and reasoning model. Written in 100% native Rust.

Equipped with an autonomous agent and native function calling to inspect, search, read, surgically edit files, and safely execute commands directly within an isolated Linux namespace sandbox (Bubblewrap).

---

## Features

- **Pure Native Rust**: Zero-dependency runtime, instant startup, and tiny memory footprint (optimized 5.6MB release binary with Thin LTO and symbols stripped).
- **Codestral Native Tool Calling**: Powered by `codestral-latest` with autonomous multi-step reasoning up to 5 iterations per turn.
- **Dual Endpoint Auto-Resolution**:
  - `MISTRAL_API_KEY` connects to `https://api.mistral.ai`.
  - `CODESTRAL_API_KEY` connects to `https://codestral.mistral.ai`.
- **Local Workspace & Web Tools**:
  - `list_files`: Inspect workspace file trees and directory structures with automated exclusion of noise directories (`target`, `.git`, `.gemini`).
  - `read_file`: Read entire files or specific line slices with a 100 KB safety limit and path traversal verification.
  - `write_file`: Create new project files or assets with recursive parent directory creation.
  - `edit_file`: Surgically replace target text blocks in existing files with character-exact match verification.
  - `search_files`: Fast codebase grep and regex pattern search across workspace files with line numbering.
  - `execute_command`: Run shell commands and tests inside an isolated Linux namespace sandbox (Bubblewrap).
  - `web_search`: Search the live web for up-to-date documentation, APIs, and technical references via Tavily API.
  - `fetch_web_page`: Extract readable text and markdown content from web documentation URLs.
- **Pixel-Perfect Ratatui TUI**:
  - Rounded green border header displaying active model, endpoint, and workspace root.
  - Role-based chat streaming with Codestral assistant boxes.
  - Animated cyan Braille thinking spinner (`⠋ ⠙  ...`) during background generation.
  - Interactive double yellow border modal prompt for security confirmations (`[y]` / `[n]`).
  - Zero-idle-CPU redraw gating (0 redraws per second when waiting for user input).
- **Security & Guardrails**:
  - **Native OS Sandboxing (Bubblewrap)**: Commands run in unprivileged Linux namespaces (`bwrap`) with read-only system mounts, isolated `/tmp`, network unshared by default, and strict containment to the workspace.
  - Path traversal protection restricting all operations to the workspace root.
  - Interactive confirmation prompts before accessing sensitive files (`.env`, `.pem`, `.key`, `id_rsa*`) or executing sandboxed commands.
  - Automatic denial in non-TTY / CI environments to avoid secret leakage or unintended execution.
- **One-Shot & Interactive Modes**: Execute immediate single-turn queries or run an interactive session with sliding-window conversation history.

---

## Requirements

- **Operating System**: Linux (required for Bubblewrap sandboxing) or any Unix-like system.
- **Bubblewrap**: `bwrap` (typically pre-installed on modern Linux distributions, or install via `sudo apt install bubblewrap`).
- **Rust Toolchain**: Rust 1.75+ (Cargo and `rustc`).
- A Mistral AI API key ([console.mistral.ai](https://console.mistral.ai/)) or Codestral dedicated key ([codestral.mistral.ai](https://codestral.mistral.ai/)).
- *(Optional)* Tavily API key ([tavily.com](https://tavily.com/)) for live web search.

---

## Installation & Setup

### 1. Clone & Build from Source

```bash
git clone https://github.com/enderliker/mist-cli.git
cd mist-cli

# Build release binaries
cargo build --release
```

The compiled binaries will be available in `target/release/`:
- `mist` (convenient short alias)
- `mist-cli` (full binary name)

### 2. Install to User Path

```bash
cargo install --path crates/mist-cli
# mist and mist-cli are now globally accessible in ~/.cargo/bin
```

---

## Configuration

Create a `.env` file in the project root or in your working directory:

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

# Optional Tavily API key for live web search
# TAVILY_API_KEY=tvly-...
```

You can also export the environment variables directly:
```bash
export MISTRAL_API_KEY="your_api_key"
```

---

## Usage

### 1. One-Shot Mode

Pass a query directly as command-line arguments:

```bash
mist "What files are in this directory?"
```

```bash
mist -m codestral-2501 "Explain how authentication is resolved in crates/mist-cli/src/config.rs"
```

You can also pipe input through standard input:
```bash
cat src/main.rs | mist "Review this file for potential issues"
```

### 2. Interactive TUI Mode

Launch the full-screen terminal interface without arguments:

```bash
mist
```

Keybindings in TUI mode:
- `Enter`: Send prompt
- `Ctrl+C`: Exit application
- `PageUp` / `PageDown`: Scroll conversation history
- `y` / `n`: Authorize or deny security prompts

### 3. Classic REPL Mode

If you prefer a plain text prompt or run in an environment without full terminal capabilities:

```bash
mist --repl
```

Supported slash commands in REPL mode:
| Command | Action |
|---|---|
| `/help` | Display interactive command overview |
| `/clear` | Reset chat history (retains system prompt) |
| `/history` | Print the number of messages in memory |
| `/exit` or `/quit` | Terminate session |

---

## Development & Testing

Run all unit, integration, and UI tests across the workspace:

```bash
# Run all tests (41 tests across mistral-client and mist-cli)
cargo test

# Run code check and linting
cargo check --workspace
```

---

## Project Structure

```text
mist-cli/
├── Cargo.toml                # Root Cargo workspace and optimization profiles
├── crates/
│   ├── mistral-client/       # Native Rust SDK for Mistral AI APIs
│   │   ├── Cargo.toml        # SDK dependencies (reqwest, serde, tokio)
│   │   ├── src/              # Client, Models, and strongly-typed Errors
│   │   └── tests/            # WireMock & serialization integration tests (12 tests)
│   └── mist-cli/             # Native Rust CLI application
│       ├── Cargo.toml        # Binary crate configuration (bins: mist, mist-cli)
│       ├── src/
│       │   ├── main.rs       # mist-cli entrypoint
│       │   ├── bin/mist.rs   # mist alias entrypoint
│       │   ├── lib.rs        # Library module exports
│       │   ├── agent.rs      # CodestralAgent orchestrator & multi-turn tool loop
│       │   ├── cli.rs        # clap parser, one-shot runner, TUI/REPL dispatcher
│       │   ├── config.rs     # Credential & endpoint resolution
│       │   ├── tools/        # 8 sandboxed developer tools & Bubblewrap engine
│       │   └── ui/           # Ratatui TUI components and event loop
│       └── tests/            # Integration, unit, and performance tests (29 tests)
└── README.md
```

---

## License

MIT
