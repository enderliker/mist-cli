# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-10-16

### Changed
- Migrated codebase 100% to native Rust: removed legacy TypeScript implementation and npm dependencies.
- Rebranded CLI to `mist-cli` with short binary alias `mist`.
- Implemented pixel-perfect Ratatui TUI matching the original terminal interface with zero idle CPU overhead.
- Release binary optimized with Thin LTO, dead code elimination, and stripped symbols (reduced size to 5.6 MB).
- Workspace structured as pure Cargo workspace (`crates/mist-cli` and `crates/mistral-client`).

## [0.3.0-beta.1] - 2026-10-16

### Added
- `search_files`: Fast codebase grep and regex search across workspace files with line numbering, file filtering, and noise directory exclusion.
- `edit_file`: Surgical search-and-replace editing tool with uniqueness verification and atomic write safety.
- `fetch_web_page`: URL web content extractor with native HTML-to-markdown parsing and Tavily Extract API integration.
- Tool guidelines in Codestral system prompt recommending searching before reading and surgical editing over rewriting.

## [0.2.0-beta.1] - 2026-10-16

### Added
- Native Linux namespace sandboxing engine using Bubblewrap (`bwrap`).
- `execute_command`: Safe sandboxed command execution with timeout, output buffer limits, and network isolation toggle (`allow_network`).
- Modern Ink React-based TUI with header banner, live message stream, input cursor, animated spinner, and interactive security prompt.
- `web_search`: Live web search tool via Tavily API with neural reranking and domain filtering.
- Dynamic environment awareness: Injected date, hour, timezone, platform, and workspace context into system prompt.

## [0.1.0-beta.1] - 2026-10-16

### Added
- Light agent CLI powered by Mistral AI's `codestral-latest` model.
- Automatic dual endpoint detection for `MISTRAL_API_KEY` (`https://api.mistral.ai`) and `CODESTRAL_API_KEY` (`https://codestral.mistral.ai`).
- Safe local file tools:
  - `read_file`: Reads files with line range slicing, file size limits (100 KB) and path traversal protection.
  - `list_files`: Explores directories, automatically ignoring `.git`, `node_modules` and `dist`.
  - `write_file`: Writes files safely and creates missing parent directories.
- One-shot command-line mode (`mistral-cli "<prompt>"`).
- Interactive REPL mode (`mistral-cli`) with commands `/help`, `/clear`, `/history`, `/exit`.
- 44 comprehensive unit tests using Vitest.

### Security
- Added interactive terminal confirmation prompt (`(s/N)`) before Codestral reads sensitive files like `.env`, `.env.*`, `*.pem`, `*.key` and `id_rsa*`.
- Auto-denies sensitive file access when executed in non-TTY environments.
