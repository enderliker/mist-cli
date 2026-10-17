import React from "react";
import { Box, Text } from "ink";

export interface UiMessage {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result" | "system" | "error";
  content: string;
}

export interface MessageListProps {
  messages: UiMessage[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <Box marginBottom={1}>
        <Text dimColor>Type your prompt or /help to view available commands.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {messages.map((msg) => {
        switch (msg.role) {
          case "user":
            return (
              <Box key={msg.id} marginY={0}>
                <Text bold color="magenta">
                  ❯{" "}
                </Text>
                <Text>{msg.content}</Text>
              </Box>
            );

          case "assistant":
            return (
              <Box
                key={msg.id}
                marginY={1}
                flexDirection="column"
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
              >
                <Text bold color="green">
                  Codestral:
                </Text>
                <Text>{msg.content}</Text>
              </Box>
            );

          case "tool_call":
            return (
              <Box key={msg.id} marginY={0}>
                <Text color="cyan">[Tool] </Text>
                <Text dimColor>{msg.content}</Text>
              </Box>
            );

          case "tool_result":
            return (
              <Box key={msg.id} marginY={0}>
                <Text color="green">[Result] </Text>
                <Text dimColor>{msg.content}</Text>
              </Box>
            );

          case "error":
            return (
              <Box key={msg.id} marginY={0}>
                <Text bold color="red">
                  [Error]{" "}
                </Text>
                <Text color="red">{msg.content}</Text>
              </Box>
            );

          case "system":
          default:
            return (
              <Box key={msg.id} marginY={0}>
                <Text dimColor>{msg.content}</Text>
              </Box>
            );
        }
      })}
    </Box>
  );
};
