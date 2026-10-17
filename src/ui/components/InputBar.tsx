import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

export interface InputBarProps {
  value: string;
  isLoading: boolean;
  loadingText?: string;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const InputBar: React.FC<InputBarProps> = ({
  value,
  isLoading,
  loadingText = "Codestral is thinking...",
}) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isLoading]);

  if (isLoading) {
    return (
      <Box marginY={0}>
        <Text color="cyan">
          {SPINNER_FRAMES[frameIndex]} {loadingText}
        </Text>
      </Box>
    );
  }

  return (
    <Box marginY={0}>
      <Text bold color="magenta">
        codestral&gt;{" "}
      </Text>
      <Text>{value}</Text>
      <Text color="gray">█</Text>
    </Box>
  );
};
