import React from "react";
import { Box, Text } from "ink";

export const StatusBar: React.FC = () => {
  return (
    <Box marginTop={1}>
      <Text dimColor>
        Commands: <Text color="yellow">/help</Text> |{" "}
        <Text color="yellow">/clear</Text> |{" "}
        <Text color="yellow">/history</Text> |{" "}
        <Text color="yellow">/exit</Text> |{" "}
        <Text color="gray">Ctrl+C</Text> to quit
      </Text>
    </Box>
  );
};
