import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodestralAgent } from "../src/agent.js";
import { MistralCliConfig } from "../src/config.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("CodestralAgent", () => {
  const dummyConfig: MistralCliConfig = {
    apiKey: "test-key",
    serverURL: "https://api.mistral.ai",
    model: "codestral-latest",
  };

  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-test-"));
    fs.writeFileSync(path.join(tempDir, "sample.txt"), "Test file content");
  });

  it("initializes agent with system prompt and allows clearing history", () => {
    const mockClient = { chat: { complete: vi.fn() } } as any;
    const agent = new CodestralAgent({
      client: mockClient,
      config: dummyConfig,
      workspaceDir: tempDir,
    });

    const history = agent.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].role).toBe("system");

    agent.clearHistory();
    expect(agent.getHistory().length).toBe(1);
  });

  it("responds directly when model triggers no tool calls", async () => {
    const mockClient = {
      chat: {
        complete: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Hello! How can I help you?",
                toolCalls: null,
              },
            },
          ],
        }),
      },
    } as any;

    const agent = new CodestralAgent({
      client: mockClient,
      config: dummyConfig,
      workspaceDir: tempDir,
    });

    const reply = await agent.chat("Hello");

    expect(reply).toBe("Hello! How can I help you?");
    const history = agent.getHistory();
    expect(history.length).toBe(3);
    expect(history[1].content).toBe("Hello");
    expect(history[2].content).toBe("Hello! How can I help you?");
  });

  it("executes Function Calling loop when model requests file reading", async () => {
    const toolCallMock = {
      id: "call_abc123",
      type: "function",
      function: {
        name: "read_file",
        arguments: JSON.stringify({ path: "sample.txt" }),
      },
    };

    const mockComplete = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              toolCalls: [toolCallMock],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "The file contains: Test file content",
              toolCalls: null,
            },
          },
        ],
      });

    const mockClient = { chat: { complete: mockComplete } } as any;

    const toolCallsFired: string[] = [];
    const toolResultsFired: string[] = [];

    const agent = new CodestralAgent({
      client: mockClient,
      config: dummyConfig,
      workspaceDir: tempDir,
      onToolCall: (name) => toolCallsFired.push(name),
      onToolResult: (name) => toolResultsFired.push(name),
    });

    const reply = await agent.chat("What is inside sample.txt?");

    expect(reply).toBe("The file contains: Test file content");
    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(toolCallsFired).toEqual(["read_file"]);
    expect(toolResultsFired).toEqual(["read_file"]);

    const history = agent.getHistory();
    expect(history.length).toBe(5);
    expect(history[2].role).toBe("assistant");
    expect(history[2].toolCalls?.[0].id).toBe("call_abc123");
    expect(history[3].role).toBe("tool");
    expect(history[3].toolCallId).toBe("call_abc123");
    expect(history[3].content).toContain("Test file content");
    expect(history[4].role).toBe("assistant");
    expect(history[4].content).toBe("The file contains: Test file content");
  });

  it("terminates tool loop when exceeding maxIterations", async () => {
    const loopToolCall = {
      id: "call_loop",
      type: "function",
      function: {
        name: "read_file",
        arguments: JSON.stringify({ path: "sample.txt" }),
      },
    };

    const mockClient = {
      chat: {
        complete: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                toolCalls: [loopToolCall],
              },
            },
          ],
        }),
      },
    } as any;

    const agent = new CodestralAgent({
      client: mockClient,
      config: dummyConfig,
      workspaceDir: tempDir,
      maxIterations: 2,
    });

    const reply = await agent.chat("Loop");

    expect(reply).toContain("[Notice] Reached maximum consecutive tool call iterations (2).");
    expect(mockClient.chat.complete).toHaveBeenCalledTimes(2);
  });

  it("handles execute_command tool call when model requests running a command", async () => {
    const toolCallMock = {
      id: "call_exec123",
      type: "function",
      function: {
        name: "execute_command",
        arguments: JSON.stringify({ command: "echo sandbox-agent-test" }),
      },
    };

    const mockComplete = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              toolCalls: [toolCallMock],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "Command ran successfully in sandbox.",
              toolCalls: null,
            },
          },
        ],
      });

    const mockClient = { chat: { complete: mockComplete } } as any;

    const agent = new CodestralAgent({
      client: mockClient,
      config: dummyConfig,
      workspaceDir: tempDir,
      onConfirmAction: vi.fn().mockResolvedValue(true),
    });

    const reply = await agent.chat("Run test command");

    expect(reply).toBe("Command ran successfully in sandbox.");
    const history = agent.getHistory();
    expect(history.length).toBe(5);
    expect(history[3].role).toBe("tool");
    expect(history[3].name).toBe("execute_command");
    expect(history[3].content).toContain("sandbox-agent-test");
  });
});
