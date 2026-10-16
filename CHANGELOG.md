# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
