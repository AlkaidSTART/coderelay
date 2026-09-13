import { Box, Text } from "ink";

import { theme } from "../theme";

export function AppHeader() {
  return (
    <Box flexDirection="row" paddingX={2} paddingTop={1}>
      <Text bold color={theme.accent}>
        coderelay
      </Text>
      <Text color={theme.dim}>{"  /  "}</Text>
      <Text color={theme.muted}>本地 agent 接力台</Text>
    </Box>
  );
}
