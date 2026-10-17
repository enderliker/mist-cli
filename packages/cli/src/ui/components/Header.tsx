import React from "react";
import { Box, Text } from "ink";

export interface HeaderProps {
  version: string;
  model: string;
  serverUrl: string;
  workspaceDir: string;
}

export const Header: React.FC<HeaderProps> = ({
  version,
  model,
  serverUrl,
  workspaceDir,
}) => {
  return (
    <Box
      borderStyle="round"
      borderColor="green"
      flexDirection="column"
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Text bold color="green">
          Mistral Codestral CLI
        </Text>
        <Text dimColor>v{version}</Text>
      </Box>
      <Box>
        <Text>
          Model: <Text color="yellow">{model}</Text>
          <Text dimColor> | </Text>
          Endpoint: <Text color="blue">{serverUrl}</Text>
        </Text>
      </Box>
      <Box>
        <Text dimColor>Workspace: {workspaceDir}</Text>
      </Box>
    </Box>
  );
};
