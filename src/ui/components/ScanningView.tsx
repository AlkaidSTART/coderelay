import {
  defaultTheme as inkDefaultTheme,
  extendTheme,
  Spinner,
  ThemeProvider as InkThemeProvider,
} from "@inkjs/ui";
import { Box, Text } from "ink";

import { CLI_IDS } from "../../models/cli";
import { theme } from "../theme";
import { cliDisplayName } from "./CliList";

const scanningTheme = extendTheme(inkDefaultTheme, {
  components: {
    Spinner: {
      styles: {
        frame: () => ({ color: theme.accent }),
      },
    },
  },
});

export function ScanningView() {
  return (
    <InkThemeProvider theme={scanningTheme}>
      <Box flexDirection="column" paddingX={2}>
        <Box flexDirection="row">
          <Spinner type="dots" />
          <Text bold color={theme.text}>
            {" "}
            正在扫描本机编码代理…
          </Text>
        </Box>
        <Text color={theme.muted}>翻翻 PATH，看看谁已经就位。</Text>

        <Box flexDirection="column" marginTop={1}>
          {CLI_IDS.map((id, index) => (
            <Text key={id}>
              <Text color={theme.dim}>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <Text color={theme.muted}>{"  "}{cliDisplayName(id)}</Text>
              <Text color={theme.dim}>{"  等待检测"}</Text>
            </Text>
          ))}
        </Box>
      </Box>
    </InkThemeProvider>
  );
}
