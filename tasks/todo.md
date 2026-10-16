# Task List: Mistral Codestral CLI

## Phase 1-3: Beta 0.1 Foundation & Local Tools (Completed)

- [x] Task 1: TypeScript ESM setup & dual authentication
- [x] Task 2: Tool Registry & `read_file`
- [x] Task 3: CodestralAgent Function Calling loop
- [x] Task 4: CLI One-Shot & Interactive REPL
- [x] Task 5: Packaging & Beta 0.1 release

---

## Phase 4: Native Sandbox & Command Execution (Beta 0.2)

### Task 6: Bubblewrap sandbox engine (`src/tools/sandbox/bubblewrap.ts`)

**Description:** Implement the core Bubblewrap engine module to detect `bwrap` availability, build isolation arguments (read-only system paths, isolated `/tmp`, workspace bind mount, namespace flags), and safely spawn sandboxed child processes with timeout and output truncation safeguards.

**Acceptance criteria:**
- [x] `isBubblewrapAvailable()` checks for `/usr/bin/bwrap` or system binary path.
- [x] `buildBubblewrapArgs()` constructs correct namespace isolation flags (`--unshare-all`, `--ro-bind` for system libs, `--bind` for workspace, optional `--share-net`).
- [x] `runInBubblewrap()` executes command with timeout protection (SIGTERM/SIGKILL) and output buffer capping (50 KB).

**Verification:**
- [x] Tests pass: `npm test -- tests/bubblewrap.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** None

**Files touched:**
- `src/tools/sandbox/bubblewrap.ts`
- `tests/bubblewrap.test.ts`

**Estimated scope:** Small: 2 files

---

### Task 7: `execute_command` tool implementation (`src/tools/execute-command.ts`)

**Description:** Implement the `execute_command` tool definition conforming to Mistral's Function Calling schema, with parameter validation, security confirmation (`onConfirmAction`), and structured JSON output.

**Acceptance criteria:**
- [x] `executeCommandToolDefinition` exposes `command` (required), `timeout_seconds`, and `allow_network` parameters.
- [x] Rejects execution with security error if user declines confirmation or running non-interactively without prompt.
- [x] Returns structured execution result (`exit_code`, `stdout`, `stderr`, `sandboxed`, `sandbox_engine`).

**Verification:**
- [x] Tests pass: `npm test -- tests/execute-command.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Task 6

**Files touched:**
- `src/tools/execute-command.ts`
- `tests/execute-command.test.ts`

**Estimated scope:** Small: 2 files

---

### Task 8: Tool registration, Agent prompt update, and CLI integration

**Description:** Register `execute_command` in `src/tools/index.ts`, update `DEFAULT_SYSTEM_PROMPT` in `src/agent.ts`, and test agent tool dispatching.

**Acceptance criteria:**
- [x] `getAllToolDefinitions()` includes `execute_command`.
- [x] `CodestralAgent` system prompt describes `execute_command` and guidance for running tests.
- [x] Agent successfully executes multi-step command tool loop.

**Verification:**
- [x] Tests pass: `npm test -- tests/agent.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Task 7

**Files touched:**
- `src/tools/index.ts`
- `src/agent.ts`
- `tests/agent.test.ts`

**Estimated scope:** Medium: 3 files

---

### Task 9: Documentation updates and version bump to `0.2.0-beta.1`

**Description:** Update `README.md` and `AGENTS.md` with sandbox capabilities, usage examples, and bump version in `package.json` and `src/cli.ts`.

**Acceptance criteria:**
- [x] `README.md` and `AGENTS.md` describe `execute_command`, Bubblewrap sandboxing model, and security rules.
- [x] `VERSION` in `src/cli.ts` and `package.json` updated to `0.2.0-beta.1`.
- [x] All unit tests pass across entire project.

**Verification:**
- [x] Tests pass: `npm test`
- [x] Build succeeds: `npm run build`
- [x] Manual check: `node dist/index.js --version` prints `0.2.0-beta.1`.

**Dependencies:** Task 8

**Files touched:**
- `package.json`
- `src/cli.ts`
- `README.md`
- `AGENTS.md`
- `tests/cli.test.ts`

**Estimated scope:** Medium: 5 files

---

## Checkpoint: Complete Beta 0.2
- [x] All test suites pass (`npm test`)
- [x] Clean build (`npm run build`)
- [x] All acceptance criteria met
