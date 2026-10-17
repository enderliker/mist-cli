import React, { useState, useEffect, useRef } from "react";
import { Box, useApp, useInput } from "ink";
import { CodestralAgent } from "../agent.js";
import { Header } from "./components/Header.js";
import { MessageList, UiMessage } from "./components/MessageList.js";
import { InputBar } from "./components/InputBar.js";
import { SecurityPrompt } from "./components/SecurityPrompt.js";
import { StatusBar } from "./components/StatusBar.js";

export interface AppProps {
  agent: CodestralAgent;
  version: string;
}

interface ConfirmState {
  description: string;
  resolve: (approved: boolean) => void;
}

export const App: React.FC<AppProps> = ({ agent, version }) => {
  const { exit } = useApp();
  const [inputVal, setInputVal] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Codestral is thinking...");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const config = agent.getConfig();
  const nextId = useRef(1);

  const addMessage = (role: UiMessage["role"], content: string) => {
    const id = String(nextId.current++);
    setMessages((prev) => [...prev, { id, role, content }]);
  };

  useEffect(() => {
    // Connect security confirmation callback to Ink state
    agent.setConfirmAction?.((description: string) => {
      return new Promise<boolean>((resolve) => {
        setConfirmState({ description, resolve });
      });
    });

    agent.setToolCallbacks?.({
      onToolCall: (name: string, args: Record<string, unknown>) => {
        setLoadingText(`Running tool '${name}'...`);
        addMessage(
          "tool_call",
          `Running '${name}' with arguments: ${JSON.stringify(args)}`
        );
      },
      onToolResult: (name: string) => {
        setLoadingText("Codestral is thinking...");
        addMessage("tool_result", `'${name}' completed.`);
      },
    });
  }, [agent]);

  useInput((input, key) => {
    // 1. Handle Security Confirmation Modal
    if (confirmState) {
      if (input.toLowerCase() === "y" || input.toLowerCase() === "s") {
        confirmState.resolve(true);
        setConfirmState(null);
      } else if (
        input.toLowerCase() === "n" ||
        key.escape ||
        (key.ctrl && input === "c")
      ) {
        confirmState.resolve(false);
        setConfirmState(null);
      }
      return;
    }

    // 2. Block typing while request is in progress
    if (isLoading) {
      return;
    }

    // 3. Handle Special Keys
    if (key.return) {
      const trimmed = inputVal.trim();
      setInputVal("");
      if (!trimmed) return;

      if (trimmed === "/exit" || trimmed === "/quit") {
        addMessage("system", "Goodbye!");
        exit();
        return;
      }

      if (trimmed === "/clear") {
        agent.clearHistory();
        setMessages([]);
        addMessage("system", "Conversation history reset.");
        return;
      }

      if (trimmed === "/history") {
        addMessage(
          "system",
          `Total messages in memory: ${agent.getHistory().length}`
        );
        return;
      }

      if (trimmed === "/help") {
        addMessage(
          "system",
          "Available commands:\n  /help     - Show this help menu\n  /clear    - Clear conversation memory\n  /history  - Show message count\n  /exit     - Exit CLI"
        );
        return;
      }

      // Standard user prompt
      addMessage("user", trimmed);
      setIsLoading(true);
      setLoadingText("Codestral is thinking...");

      (async () => {
        try {
          const reply = await agent.chat(trimmed);
          addMessage("assistant", reply);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addMessage("error", msg);
        } finally {
          setIsLoading(false);
        }
      })();
      return;
    }

    if (key.backspace || key.delete) {
      setInputVal((prev) => prev.slice(0, -1));
      return;
    }

    if (key.escape) {
      setInputVal("");
      return;
    }

    // Ignore arrow keys or non-printable controls
    if (
      key.upArrow ||
      key.downArrow ||
      key.leftArrow ||
      key.rightArrow ||
      key.ctrl ||
      key.meta
    ) {
      return;
    }

    if (input) {
      setInputVal((prev) => prev + input);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        version={version}
        model={config.model}
        serverUrl={config.serverURL}
        workspaceDir={process.cwd()}
      />

      <MessageList messages={messages} />

      {confirmState ? (
        <SecurityPrompt description={confirmState.description} />
      ) : (
        <InputBar
          value={inputVal}
          isLoading={isLoading}
          loadingText={loadingText}
        />
      )}

      <StatusBar />
    </Box>
  );
};
