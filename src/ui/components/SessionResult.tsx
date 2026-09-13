import { Box, Text } from "ink";

import type { CliId } from "../../models/cli";
import { theme } from "../theme";
import { cliDisplayName } from "./CliList";

export interface SessionResultData {
  readonly code: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
}

export interface SessionResultProps {
  readonly session: SessionResultData & { readonly id: CliId };
}

interface SessionStatus {
  readonly symbol: string;
  readonly label: string;
  readonly color: string;
  readonly description: string;
}

function sessionStatus(
  id: CliId,
  code: number | null,
  signal: string | null,
): SessionStatus {
  const name = cliDisplayName(id);

  if (signal) {
    return {
      symbol: "!",
      label: `被信号终止（${signal}）`,
      color: theme.warn,
      description: `${name} 被中断了，可以重新选一次。`,
    };
  }

  if (code === 0) {
    return {
      symbol: "✓",
      label: "成功",
      color: theme.ok,
      description: `${name} 跑完了这一棒，可以继续往下接。`,
    };
  }

  if (code === null) {
    return {
      symbol: "×",
      label: "失败",
      color: theme.warn,
      description: `${name} 没能正常启动，检查一下安装或权限。`,
    };
  }

  return {
    symbol: "×",
    label: "失败",
    color: theme.warn,
    description: `${name} 提前退出了，回去看看终端输出。`,
  };
}

export function SessionResult({ session }: SessionResultProps) {
  const status = sessionStatus(session.id, session.code, session.signal);
  const duration = (session.durationMs / 1_000).toFixed(1);

  return (
    <Box flexDirection="column" paddingX={2}>
      <Text bold color={status.color}>
        {status.symbol} {status.label}
      </Text>
      <Text color={theme.text}>{status.description}</Text>
      <Text color={theme.dim}>
        exit {session.code ?? "—"}  ·  {duration}s
      </Text>
    </Box>
  );
}
