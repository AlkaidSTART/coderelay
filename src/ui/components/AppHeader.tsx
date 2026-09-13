import { Box, Text } from "ink";

import { theme } from "../theme";

export function AppHeader() {
  return (
    <Box flexDirection="row" paddingX={2} paddingY={1}>
      <Text bold color={theme.pinkInk}>
        code
      </Text>
      <Text bold color={theme.text}>
        relay
      </Text>
      <Text color={theme.line}>{"  ·  "}</Text>
      <Text color={theme.muted}>本地 agent 接力台</Text>
    </Box>
  );
}
