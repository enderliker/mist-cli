import React from "react";
import { Box, Text } from "ink";

export interface SecurityPromptProps {
  description: string;
}

export const SecurityPrompt: React.FC<SecurityPromptProps> = ({ description }) => {
  return (
    <Box
      borderStyle="double"
      borderColor="yellow"
      flexDirection="column"
      paddingX={1}
      marginY={1}
    >
      <Box>
        <Text bold color="yellow">
          ⚠️  Security Authorization Required
        </Text>
      </Box>
      <Box marginY={0}>
        <Text>Codestral requests permission to {description}.</Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          Authorize? Press <Text bold color="green">[y]</Text> to confirm,{" "}
          <Text bold color="red">[n]</Text> to deny.
        </Text>
      </Box>
    </Box>
  );
};
