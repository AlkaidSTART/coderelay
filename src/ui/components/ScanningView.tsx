import { Spinner } from "@inkjs/ui";
import { Box, Text } from "ink";

import { CLI_IDS } from "../../models/cli";
import { theme } from "../theme";
import { cliDisplayName } from "./CliList";

export function ScanningView() {
  return (
    <Box flexDirection="column" paddingX={2}>
      <Box flexDirection="row">
        <Spinner type="dots" />
        <Text color={theme.text}> 正在扫描本机编码代理…</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {CLI_IDS.map((id) => (
          <Text key={id} color={theme.dim}>
            ○ {cliDisplayName(id)} 等待检测
          </Text>
        ))}
      </Box>
    </Box>
  );
}
