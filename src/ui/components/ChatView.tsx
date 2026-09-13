import { Spinner, TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";

import type { SessionTurn } from "../../models/session";
import { theme } from "../theme";
import { cliDisplayName } from "./CliList";

/** 对话板内最多渲染的轮数，长会话只保留结尾。 */
const TURN_TAIL = 8;
/** 每轮输出最多渲染的行数。 */
const TURN_OUTPUT_LINES = 3;

export interface RunningState {
  readonly agentName: string;
  readonly prompt: string;
  readonly startedAt: number;
}

export interface SlashCommandOption {
  readonly name: string;
  readonly description: string;
}

export interface ChatViewProps {
  readonly agentName: string;
  readonly turns: readonly SessionTurn[];
  readonly running: RunningState | null;
  readonly prompt: string;
  readonly notice: string | null;
  readonly commands: readonly SlashCommandOption[];
  readonly onChange: (value: string) => void;
  readonly onSubmit: (value: string) => void;
}

function useElapsedSeconds(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startedAt === null) {
      setElapsed(0);
      return;
    }

    const tick = () => {
      setElapsed(Math.max(0, (Date.now() - startedAt) / 1000));
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => {
      clearInterval(timer);
    };
  }, [startedAt]);

  return elapsed;
}

function TurnBlock({ turn }: { readonly turn: SessionTurn }) {
  const failed =
    turn.signal !== null || (turn.exitCode !== null && turn.exitCode !== 0);
  const outputText = turn.output.trim() ? turn.output : "";
  const lines = outputText
    ? outputText.replace(/\s+$/, "").split("\n").slice(-TURN_OUTPUT_LINES)
    : [];

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text bold color={theme.muted}>
          ❯{" "}
        </Text>
        <Text color={theme.text} wrap="truncate-end">
          {turn.prompt}
        </Text>
      </Text>
      {lines.map((line, index) => (
        <Text
          key={index}
          color={failed ? theme.alert : theme.text}
          wrap="truncate-end"
        >
          {line === "" ? " " : line}
        </Text>
      ))}
      <Text color={failed ? theme.alert : theme.dim}>
        {`${failed ? "×" : "✓"} ${cliDisplayName(turn.cliId)} · exit ${turn.exitCode ?? "—"} · ${(turn.durationMs / 1_000).toFixed(1)}s`}
        {turn.signal ? ` · ${turn.signal}` : ""}
      </Text>
    </Box>
  );
}

/**
 * 对话区：多轮对话住在一块圆角玻璃板里，输入框常驻板底——
 * 一轮结束立刻回到可输入状态；running 时输入框保留但禁用。
 */
export function ChatView({
  agentName,
  turns,
  running,
  prompt,
  notice,
  commands,
  onChange,
  onSubmit,
}: ChatViewProps) {
  const elapsed = useElapsedSeconds(running?.startedAt ?? null);
  const [submitNonce, setSubmitNonce] = useState(0);
  const lastSubmittedRef = useRef<string | null>(null);
  // TextInput 非受控：挂载时捕获一次种子值，之后内部状态是唯一事实，
  // 重挂载（key 变化）永远从空串开始，避免与父组件的清空 setState 竞态。
  const [initialPrompt] = useState(prompt);
  const tail = turns.slice(-TURN_TAIL);
  const idle = running === null;

  const handleChange = (value: string): void => {
    // 提交后 React 会补发一条「提交前最后一次输入」的过期 onChange
    // （passive effect 晚于提交刷新），吞掉它，防止把父组件刚清空的
    // prompt / notice 写回旧值。
    if (lastSubmittedRef.current !== null && value === lastSubmittedRef.current) {
      return;
    }
    lastSubmittedRef.current = null;
    onChange(value);
  };

  const handleSubmit = (value: string): void => {
    lastSubmittedRef.current = value;
    // TextInput 非受控，重挂载才能清空输入框。
    setSubmitNonce((nonce) => nonce + 1);
    onSubmit(value);
  };

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
        borderStyle="round"
        borderColor={theme.edge}
      >
        {tail.length > 0 ? (
          <Text color={theme.dim}>{`会话 · ${turns.length} 轮`}</Text>
        ) : (
          <>
            <Text>
              <Text color={theme.muted}>将任务交给 </Text>
              <Text bold color={theme.text}>
                {agentName}
              </Text>
            </Text>
            <Text color={theme.dim}>
              写清目标和完成标准，接力会更稳。输入 / 查看命令。
            </Text>
          </>
        )}

        {tail.map((turn) => (
          <TurnBlock key={turn.id} turn={turn} />
        ))}

        {running ? (
          <>
            <Box flexDirection="row" marginTop={tail.length > 0 ? 1 : 0}>
              <Spinner type="dots" />
              <Text> </Text>
              <Text>
                <Text color={theme.muted}>正在把任务交给 </Text>
                <Text bold color={theme.text}>
                  {running.agentName}
                </Text>
              </Text>
              <Text bold color={theme.accent}>
                {` ${elapsed.toFixed(1)}s`}
              </Text>
            </Box>
            <Text color={theme.dim} wrap="truncate-end">
              {running.prompt}
            </Text>
          </>
        ) : null}

        {commands.map((command) => (
          <Text key={command.name}>
            <Text bold color={theme.accent}>
              {command.name}
            </Text>
            <Text color={theme.dim}>{`  ${command.description}`}</Text>
          </Text>
        ))}
        {notice ? <Text color={theme.dim}>{notice}</Text> : null}

        <Box flexDirection="row" marginTop={1}>
          <Text bold={idle} color={idle ? theme.accent : theme.dim}>
            ❯{" "}
          </Text>
          <TextInput
            key={submitNonce}
            defaultValue={initialPrompt}
            placeholder="写下任务，/ 查看命令…"
            onChange={handleChange}
            onSubmit={handleSubmit}
            isDisabled={!idle}
          />
        </Box>
      </Box>
    </Box>
  );
}
