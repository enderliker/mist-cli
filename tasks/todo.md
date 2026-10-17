# Task List: Mistral Codestral CLI

## Phase 1-4: Foundation, Sandboxing & UI (Completed)

- [x] Task 1: TypeScript ESM setup & dual authentication
- [x] Task 2: Tool Registry & `read_file`
- [x] Task 3: CodestralAgent Function Calling loop
- [x] Task 4: CLI One-Shot & Interactive REPL
- [x] Task 5: Packaging & Beta 0.1 release
- [x] Task 6: Bubblewrap sandbox engine (`src/tools/sandbox/bubblewrap.ts`)
- [x] Task 7: `execute_command` tool implementation
- [x] Task 8: Tool registration & agent prompt update
- [x] Task 9: Packaging & Beta 0.2 release
- [x] Task 9.1: Ink React-based TUI upgrade
- [x] Task 9.2: `web_search` tool via Tavily API

---

## Phase 5: Essential Developer Tools (v0.3.0)

### Task 10: `search_files` tool implementation (`src/tools/search-files.ts`)

**Description:** Implement a fast workspace grep tool enabling Codestral to search for code patterns, function names, classes, or error strings across files with line numbers, file filtering, and noise directory exclusions.

**Acceptance criteria:**
- [x] `searchFilesToolDefinition` exposes `pattern` (required), `path` (optional subpath), `case_sensitive` (optional boolean, default false), `file_pattern` (optional glob/extension filter like `*.ts`), and `max_results` (optional, default 50).
- [x] Automatically ignores noise directories (`node_modules`, `.git`, `dist`, `.gemini`, `.codex`, etc.).
- [x] Enforces path traversal checks against `workspaceDir`.
- [x] Returns structured JSON output with `matches_count` and list of matches containing `file`, `line`, and `text`.

**Verification:**
- [x] Tests pass: `npm test -- tests/search-files.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** None

**Files touched:**
- `src/tools/search-files.ts`
- `tests/search-files.test.ts`

**Estimated scope:** Small: 2 files

---

### Task 11: `edit_file` tool implementation (`src/tools/edit-file.ts`)

**Description:** Implement a surgical search-and-replace editing tool allowing Codestral to make targeted code changes without rewriting entire files.

**Acceptance criteria:**
- [x] `editFileToolDefinition` exposes `path` (required), `target_content` (required), `replacement_content` (required), and `expected_matches` (optional number, default 1).
- [x] Enforces path traversal checks against `workspaceDir` and ensures target file exists.
- [x] Verifies `target_content` exists in the file and matches exactly `expected_matches` times; fails closed with a clear error if 0 or ambiguous matches are found.
- [x] Performs safe atomic write and returns a confirmation message with line numbers affected.

**Verification:**
- [x] Tests pass: `npm test -- tests/edit-file.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** None

**Files touched:**
- `src/tools/edit-file.ts`
- `tests/edit-file.test.ts`

**Estimated scope:** Small: 2 files

---

### Task 12: `fetch_web_page` tool implementation (`src/tools/fetch-web-page.ts`)

**Description:** Implement a web documentation reader tool that fetches URL content, strips noisy HTML elements, and returns clean readable markdown/text up to a safety length limit.

**Acceptance criteria:**
- [x] `fetchWebPageToolDefinition` exposes `url` (required) and `max_length` (optional, default 20000).
- [x] Validates URL protocol (`http:` or `https:`) and enforces a 15-second timeout via `AbortSignal.timeout(15000)`.
- [x] Extracts readable text/markdown from HTML (stripping `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`).
- [x] If `TAVILY_API_KEY` is present, uses Tavily's extract API (`https://api.tavily.com/extract`) when preferred, falling back to native fetch cleanly.
- [x] Truncates content at `max_length` with a clear truncation indicator.

**Verification:**
- [x] Tests pass: `npm test -- tests/fetch-web-page.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** None

**Files touched:**
- `src/tools/fetch-web-page.ts`
- `tests/fetch-web-page.test.ts`

**Estimated scope:** Small: 2 files

---

### Checkpoint: Tools Verification
- [x] All new tool unit tests pass: `npm test -- tests/search-files.test.ts tests/edit-file.test.ts tests/fetch-web-page.test.ts`
- [x] Build succeeds without TypeScript errors: `npm run build`

---

### Task 13: Tool registration & Agent prompt guidelines

**Description:** Register `search_files`, `edit_file`, and `fetch_web_page` in `src/tools/index.ts`, update `buildSystemPrompt` in `src/agent.ts` to instruct the model to prefer searching before reading and surgical editing before full overwrites, and add integration tests.

**Acceptance criteria:**
- [x] `getAllToolDefinitions()` returns all 8 tools (`read_file`, `list_files`, `write_file`, `execute_command`, `web_search`, `search_files`, `edit_file`, `fetch_web_page`).
- [x] `buildSystemPrompt` includes definitions and best practice guidelines for using `search_files` to navigate codebases and `edit_file` for targeted modifications.
- [x] Agent Function Calling loop correctly dispatches calls to the new tools.

**Verification:**
- [x] Tests pass: `npm test -- tests/agent.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tasks 10, 11, 12

**Files touched:**
- `src/tools/index.ts`
- `src/agent.ts`
- `tests/agent.test.ts`

**Estimated scope:** Medium: 3 files

---

### Task 14: Documentation & Version Bump to `0.3.0-beta.1`

**Description:** Update `README.md`, `AGENTS.md`, `package.json`, and `src/cli.ts` VERSION to `0.3.0-beta.1` and record changes in `CHANGELOG.md`.

**Acceptance criteria:**
- [x] `README.md` and `AGENTS.md` describe all tools and usage examples.
- [x] `VERSION` in `package.json` and `src/cli.ts` updated to `0.3.0-beta.1`.
- [x] Full test suite passes across the entire project.

**Verification:**
- [x] Tests pass: `npm test`
- [x] Build succeeds: `npm run build`
- [x] Manual check: `node dist/index.js --version` prints `0.3.0-beta.1`

**Dependencies:** Task 13

**Files touched:**
- `package.json`
- `src/cli.ts`
- `README.md`
- `AGENTS.md`
- `CHANGELOG.md`
- `tests/cli.test.ts`

**Estimated scope:** Medium: 6 files

---

## Checkpoint: Complete v0.3.0
- [x] All test suites pass (`npm test`)
- [x] Clean build (`npm run build`)
- [x] All acceptance criteria met
