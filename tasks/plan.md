# Implementation Plan: Essential Developer Tools (v0.3.0)

## Overview
Expand `mistral-cli` for version **v0.3.0-beta.1** by implementing three essential developer tools that bridge critical workflow gaps in code exploration, precision file modification, and external documentation reading:
1. **`search_files`**: Fast codebase grep/regex search across workspace files with line numbering, file pattern filtering, and noise directory exclusion.
2. **`edit_file`**: Surgical search-and-replace text editing tool to make precision code changes without rewriting entire files.
3. **`fetch_web_page`**: Clean URL web content extractor for reading full documentation pages and API references discovered via `web_search`.

---

## Architecture Decisions

### 1. `search_files` (Workspace Grep)
- **Path Traversal & Noise Directory Exclusion**: Strictly confined to `workspaceDir`. Automatically skips `node_modules`, `.git`, `dist`, `.gemini`, `.codex`, etc.
- **Output Budget Safeguard**: Caps results at `max_results` (default 50) and matches per line to prevent blowing up the LLM token context.
- **Pattern Matching**: Supports both literal string matches and regular expressions, with optional file pattern filtering (e.g. `*.ts`, `src/**`).

### 2. `edit_file` (Surgical Search & Replace)
- **Precision Over Entire Rewrite**: Prevents accidental truncation or token exhaustion common with full-file `write_file`.
- **Uniqueness Verification**: Checks that `target_content` matches exactly once (or matches `expected_matches`), failing closed if ambiguous or not found.
- **Atomic File Writing**: Writes via safe temporary file replace or atomic write, preserving line endings (LF vs CRLF).

### 3. `fetch_web_page` (Documentation & Article Reader)
- **Zero Heavy Dependencies**: Native `fetch` with `AbortSignal.timeout(15000)` and lightweight HTML-to-text markdown parsing (stripping `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`).
- **Tavily Extract API Support**: If `TAVILY_API_KEY` is present, supports using Tavily's dedicated extraction endpoint (`https://api.tavily.com/extract`) for AI-ready clean markdown with native fetch fallback.
- **Context Guard**: Enforces configurable maximum character length (default 20,000 chars) to safeguard the model context window.

---

## Dependency Graph

```
Tools Foundation & Security Guardrails (src/tools/types.ts)
    │
    ├── search_files (src/tools/search-files.ts)
    ├── edit_file (src/tools/edit-file.ts)
    └── fetch_web_page (src/tools/fetch-web-page.ts)
            │
            └── Tool Registry Dispatcher (src/tools/index.ts)
                    │
                    ├── CodestralAgent System Prompt (src/agent.ts)
                    └── Ink TUI Presentation (src/ui/components/MessageList.tsx)
```

---

## Task List

### Phase 1-4: Foundation, Sandboxing & UI (Completed)
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

### Phase 5: Essential Developer Tools (v0.3.0)

#### Task 10: `search_files` tool implementation
- [ ] Implement `src/tools/search-files.ts` with regex/literal grep, line numbering, noise filtering, and match capping.
- [ ] Add unit tests in `tests/search-files.test.ts`.

#### Task 11: `edit_file` tool implementation
- [ ] Implement `src/tools/edit-file.ts` with target content verification, atomic replacement, and path safety.
- [ ] Add unit tests in `tests/edit-file.test.ts`.

#### Task 12: `fetch_web_page` tool implementation
- [ ] Implement `src/tools/fetch-web-page.ts` with HTML parsing, Tavily extract integration, timeouts, and length limits.
- [ ] Add unit tests in `tests/fetch-web-page.test.ts`.

### Checkpoint: Tools Verification
- [ ] All new tool unit tests pass (`npm test -- tests/search-files.test.ts tests/edit-file.test.ts tests/fetch-web-page.test.ts`)
- [ ] TypeScript compiles cleanly (`npm run build`)

#### Task 13: Tool registration & Agent prompt guidelines
- [ ] Register `search_files`, `edit_file`, and `fetch_web_page` in `src/tools/index.ts`.
- [ ] Update `buildSystemPrompt` in `src/agent.ts` with best practices (search before read, edit before overwrite).
- [ ] Update Ink TUI `MessageList.tsx` for tool result styling if needed.
- [ ] Add integration tests in `tests/agent.test.ts`.

#### Task 14: Documentation & Version Bump to `0.3.0-beta.1`
- [ ] Update `README.md` and `AGENTS.md` with new tool definitions and workflows.
- [ ] Bump version in `package.json` and `src/cli.ts` to `0.3.0-beta.1`.
- [ ] Update `CHANGELOG.md`.

### Checkpoint: Complete v0.3.0
- [ ] Full test suite passes (`npm test`)
- [ ] Clean build (`npm run build`)
- [ ] All acceptance criteria met

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ambiguous edits corrupting files | High | Enforce unique match verification: reject edit if target string occurs 0 or >1 times unless `expected_matches` is explicitly set. |
| Large repositories causing slow search | Medium | Stream files, skip ignored directories early, cap results at 50 matches. |
| Fetching giant HTML documents exceeding LLM context | Medium | Strip non-content HTML tags, convert to compact Markdown, and enforce max length slice (default 20 KB). |
| Path traversal attempts | High | Use existing path resolution and `workspaceDir` prefix checks across all file tools. |
