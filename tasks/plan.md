# Implementation Plan: Mistral Codestral CLI (Beta 0.2)

## Overview
Expand `mistral-cli` for version **Beta 0.2** by introducing a native OS-level secure sandbox powered by **Bubblewrap (`bwrap`)** and a new agent tool: **`execute_command`**. This allows Codestral to run unit tests, build commands, and terminal tools within an unprivileged Linux namespace sandbox that is strictly constrained to the workspace directory, with network isolation and interactive confirmation.

## Architecture Decisions
- **Native OS Sandboxing with Bubblewrap**: Use Bubblewrap (`bwrap`) to provide lightweight, unprivileged Linux namespace isolation (mount, PID, IPC, UTS, network) without requiring Docker or root privileges.
- **Strict Workspace Containment**: Bind the host's `/usr`, `/lib`, `/bin` as read-only, isolate `/proc` and `/dev`, mount a clean `tmpfs` at `/tmp`, and bind-mount only `workspaceDir` as read-write.
- **Network Isolation by Default**: Run with `--unshare-all` (no network access) by default, requiring explicit `allow_network: true` to enable `--share-net`.
- **Security Confirmation & Safeguards**: Require interactive authorization before executing any command (`onConfirmAction`), enforce execution timeouts (default 30s), and cap output at 50 KB to prevent context exhaustion.

## Dependency Graph

```
Bubblewrap Sandbox Engine (src/tools/sandbox/bubblewrap.ts)
    │
    ├── execute_command Tool (src/tools/execute-command.ts)
    │       │
    │       └── Tool Registry Dispatcher (src/tools/index.ts)
    │               │
    │               └── Agent System Prompt & CLI REPL Integration (src/agent.ts, src/cli.ts)
```

## Task List

### Phase 1-3: Beta 0.1 Foundation & Tools (Completed)
- [x] Task 1: TypeScript ESM setup & dual authentication
- [x] Task 2: Tool Registry & `read_file`
- [x] Task 3: CodestralAgent Function Calling loop
- [x] Task 4: CLI One-Shot & Interactive REPL
- [x] Task 5: Packaging & Beta 0.1 release

### Phase 4: Native Sandbox & Command Execution (Beta 0.2)
- [ ] Task 6: Implement Bubblewrap sandbox engine (`src/tools/sandbox/bubblewrap.ts`) with unit tests
- [ ] Task 7: Implement `execute_command` tool with security confirmation and output safeguards
- [ ] Task 8: Register `execute_command` in tool registry, update agent system prompt, and integrate with CLI
- [ ] Task 9: Update documentation (`README.md`, `AGENTS.md`) and bump version to `0.2.0-beta.1`

### Checkpoint: Complete Beta 0.2
- [ ] All unit tests pass (`npm test`)
- [ ] TypeScript compiles cleanly (`npm run build`)
- [ ] Live sandboxed execution verified in REPL
