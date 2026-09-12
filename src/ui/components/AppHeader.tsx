import { Box, Text } from "ink";

import { theme } from "../theme";

export function AppHeader() {
  return (
    <Box flexDirection="column" paddingX={2}>
      <Text bold color={theme.text}>
        CODERELAY
      </Text>
      <Text color={theme.muted}>本地编码代理 · 扫描与接力</Text>
      <Box marginTop={1}>
        <Text color={theme.line}>{"─".repeat(64)}</Text>
      </Box>
    </Box>
  );
}
