import { describe, it, expect, vi } from "vitest";
import { parseArgs, runOneShot, VERSION } from "../src/cli.js";
import { CodestralAgent } from "../src/agent.js";

describe("CLI Argument Parsing", () => {
  it("detects help flags", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("detects version flags", () => {
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
    expect(VERSION).toBe("0.3.0-beta.1");
  });

  it("parses custom model and base-url", () => {
    const res = parseArgs([
      "-m",
      "codestral-2501",
      "-b",
      "https://custom.mistral.test/v1",
      "Hello",
      "world",
    ]);

    expect(res.model).toBe("codestral-2501");
    expect(res.baseUrl).toBe("https://custom.mistral.test/v1");
    expect(res.prompt).toBe("Hello world");
  });

  it("joins positional arguments into a single prompt", () => {
    const res = parseArgs(["Explain", "the", "file", "index.ts"]);
    expect(res.prompt).toBe("Explain the file index.ts");
  });

  it("executes runOneShot successfully", async () => {
    const mockAgent = {
      chat: vi.fn().mockResolvedValue("Explanation of the file."),
      setConfirmAction: vi.fn(),
    } as unknown as CodestralAgent;

    const exitCode = await runOneShot(mockAgent, "Explain index.ts");
    expect(exitCode).toBe(0);
    expect(mockAgent.chat).toHaveBeenCalledWith("Explain index.ts");
    expect(mockAgent.setConfirmAction).toHaveBeenCalled();
  });

  it("handles errors in runOneShot by returning exit code 1", async () => {
    const mockAgent = {
      chat: vi.fn().mockRejectedValue(new Error("Network failure")),
      setConfirmAction: vi.fn(),
    } as unknown as CodestralAgent;

    const exitCode = await runOneShot(mockAgent, "Error test");
    expect(exitCode).toBe(1);
  });

  it("processes special REPL commands correctly", async () => {
    const { handleReplCommand } = await import("../src/cli.js");
    const mockAgent = {
      clearHistory: vi.fn(),
      getHistory: vi.fn().mockReturnValue([{}, {}]),
    } as unknown as CodestralAgent;

    expect(handleReplCommand("/exit", mockAgent)).toBe("exit");
    expect(handleReplCommand("/quit", mockAgent)).toBe("exit");

    expect(handleReplCommand("/clear", mockAgent)).toBe("handled");
    expect(mockAgent.clearHistory).toHaveBeenCalled();

    expect(handleReplCommand("/history", mockAgent)).toBe("handled");
    expect(mockAgent.getHistory).toHaveBeenCalled();

    expect(handleReplCommand("/help", mockAgent)).toBe("handled");
    expect(handleReplCommand("How are you?", mockAgent)).toBe("continue");
  });
});
