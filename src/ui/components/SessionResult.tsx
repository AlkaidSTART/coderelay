import { Box, Text } from "ink";

import type { CliId } from "../../models/cli";
import { theme } from "../theme";
import { cliDisplayName } from "./CliList";

export interface SessionResultData {
  readonly code: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly stdout?: string;
  readonly stderr?: string;
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

/** 结果屏最多渲染输出尾部的行数，长输出只保留结尾。 */
const OUTPUT_TAIL_LINES = 12;

interface RenderedOutput {
  readonly lines: readonly string[];
  readonly truncated: boolean;
  readonly isError: boolean;
}

/**
 * 渲染层的数据侧：失败优先展示 stderr，其次 stdout，
 * 成功时 stderr 仍作为诊断信息展示；都为空则不渲染输出块。
 */
function renderedOutput(session: SessionResultData): RenderedOutput | null {
  const stdout = session.stdout?.trim() ? session.stdout : "";
  const stderr = session.stderr?.trim() ? session.stderr : "";
  const failed =
    session.signal !== null || (session.code !== null && session.code !== 0);

  const picked =
    failed && stderr
      ? { text: stderr, isError: true }
      : stdout
        ? { text: stdout, isError: false }
        : stderr
          ? { text: stderr, isError: true }
          : null;
  if (!picked) {
    return null;
  }

  const all = picked.text.replace(/\s+$/, "").split("\n");
  return {
    lines: all.slice(-OUTPUT_TAIL_LINES),
    truncated: all.length > OUTPUT_TAIL_LINES,
    isError: picked.isError,
  };
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
      color: theme.alert,
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
      color: theme.alert,
      description: `${name} 没能正常启动，检查一下安装或权限。`,
    };
  }

  return {
    symbol: "×",
    label: "失败",
    color: theme.alert,
    description: `${name} 提前退出了，回去看看终端输出。`,
  };
}

export function SessionResult({ session }: SessionResultProps) {
  const status = sessionStatus(session.id, session.code, session.signal);
  const duration = (session.durationMs / 1_000).toFixed(1);
  const output = renderedOutput(session);

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
        borderStyle="round"
        borderColor={theme.edge}
      >
        <Text>
          <Text bold color={status.color}>
            {status.symbol}{" "}
          </Text>
          <Text bold color={theme.text}>
            {status.label}
          </Text>
        </Text>
        <Text color={theme.muted}>{status.description}</Text>
        <Text color={theme.dim}>
          exit {session.code ?? "—"}  ·  {duration}s
        </Text>
      </Box>
      {output ? (
        <Box flexDirection="column" marginTop={1} paddingLeft={1}>
          <Text color={output.isError ? theme.alert : theme.dim}>
            {output.isError ? "stderr" : "输出"} ·{" "}
            {output.truncated ? `最后 ${OUTPUT_TAIL_LINES} 行` : `${output.lines.length} 行`}
          </Text>
          {output.lines.map((line, index) => (
            <Text key={index} color={output.isError ? theme.alert : theme.text} wrap="truncate-end">
              {line === "" ? " " : line}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
