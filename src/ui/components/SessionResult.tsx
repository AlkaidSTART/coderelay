import { Box, Text } from "ink";

import { theme } from "../theme";

export interface SessionResultData {
  readonly code: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
}

export interface SessionResultProps {
  readonly session: SessionResultData;
}

function sessionStatus(
  code: number | null,
  signal: string | null,
): { readonly label: string; readonly color: string } {
  if (signal) {
    return { label: `被信号终止（${signal}）`, color: theme.warn };
  }

  if (code === 0) {
    return { label: "成功", color: theme.ok };
  }

  return { label: "失败", color: theme.warn };
}

export function SessionResult({ session }: SessionResultProps) {
  const status = sessionStatus(session.code, session.signal);
  const duration = (session.durationMs / 1_000).toFixed(1);

  return (
    <Box
      flexDirection="column"
      width="100%"
      paddingX={2}
      paddingY={1}
      backgroundColor={theme.panel}
    >
      <Text color={theme.muted}>会话结束</Text>
      <Text color={status.color}>{status.label}</Text>
      <Text color={theme.line}>────────────────</Text>
      <Text color={theme.muted}>
        exit code {session.code ?? "—"} · 耗时 {duration} 秒
      </Text>
      <Text color={theme.dim}>返回选择以继续接力，或退出 coderelay。</Text>
    </Box>
  );
}
