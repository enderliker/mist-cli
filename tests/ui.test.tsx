import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Header } from "../src/ui/components/Header.js";
import { MessageList, UiMessage } from "../src/ui/components/MessageList.js";
import { SecurityPrompt } from "../src/ui/components/SecurityPrompt.js";
import { InputBar } from "../src/ui/components/InputBar.js";
import { StatusBar } from "../src/ui/components/StatusBar.js";

describe("Ink TUI Components", () => {
  describe("Header", () => {
    it("renders CLI title, version, model, and workspace", () => {
      const { lastFrame } = render(
        <Header
          version="0.2.0-beta.1"
          model="codestral-latest"
          serverUrl="https://codestral.mistral.ai"
          workspaceDir="/home/user/project"
        />
      );

      const frame = lastFrame() || "";
      expect(frame).toContain("Mistral Codestral CLI");
      expect(frame).toContain("v0.2.0-beta.1");
      expect(frame).toContain("codestral-latest");
      expect(frame).toContain("https://codestral.mistral.ai");
      expect(frame).toContain("/home/user/project");
    });
  });

  describe("MessageList", () => {
    it("renders placeholder when messages list is empty", () => {
      const { lastFrame } = render(<MessageList messages={[]} />);
      const frame = lastFrame() || "";
      expect(frame).toContain("Type your prompt or /help");
    });

    it("renders user prompt, assistant reply, tool events, and error", () => {
      const messages: UiMessage[] = [
        { id: "1", role: "user", content: "List all files" },
        { id: "2", role: "tool_call", content: "Running 'list_files'" },
        { id: "3", role: "tool_result", content: "'list_files' completed." },
        { id: "4", role: "assistant", content: "Found 5 files." },
        { id: "5", role: "error", content: "Failed to connect" },
      ];

      const { lastFrame } = render(<MessageList messages={messages} />);
      const frame = lastFrame() || "";

      expect(frame).toContain("❯ List all files");
      expect(frame).toContain("[Tool] Running 'list_files'");
      expect(frame).toContain("[Result] 'list_files' completed.");
      expect(frame).toContain("Codestral:");
      expect(frame).toContain("Found 5 files.");
      expect(frame).toContain("[Error] Failed to connect");
    });
  });

  describe("SecurityPrompt", () => {
    it("renders security authorization dialog with description and key hints", () => {
      const { lastFrame } = render(
        <SecurityPrompt description="execute sandboxed command 'curl ifconfig.me'" />
      );

      const frame = lastFrame() || "";
      expect(frame).toContain("Security Authorization Required");
      expect(frame).toContain("execute sandboxed command 'curl ifconfig.me'");
      expect(frame).toContain("[y]");
      expect(frame).toContain("[n]");
    });
  });

  describe("InputBar", () => {
    it("renders prompt, value, and cursor when not loading", () => {
      const { lastFrame } = render(
        <InputBar value="hello world" isLoading={false} />
      );

      const frame = lastFrame() || "";
      expect(frame).toContain("codestral>");
      expect(frame).toContain("hello world");
    });

    it("renders loading indicator when isLoading is true", () => {
      const { lastFrame } = render(
        <InputBar
          value=""
          isLoading={true}
          loadingText="Running sandboxed command..."
        />
      );

      const frame = lastFrame() || "";
      expect(frame).toContain("Running sandboxed command...");
    });
  });

  describe("StatusBar", () => {
    it("renders commands and exit shortcut", () => {
      const { lastFrame } = render(<StatusBar />);
      const frame = lastFrame() || "";
      expect(frame).toContain("/help");
      expect(frame).toContain("/clear");
      expect(frame).toContain("/history");
      expect(frame).toContain("/exit");
      expect(frame).toContain("Ctrl+C");
    });
  });
});
