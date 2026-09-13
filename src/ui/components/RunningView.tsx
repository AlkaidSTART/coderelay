import { Spinner } from "@inkjs/ui";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";

import { theme } from "../theme";

export interface RunningViewProps {
  readonly agentName: string;
  readonly prompt: string;
  readonly startedAt: number;
}

/**
 * 加载层：任务已交给 agent、结果还没回来时的唯一画面。
 * Spinner 与计时用系统蓝，是「可以动的东西」在这一屏的出现。
 */
export function RunningView({ agentName, prompt, startedAt }: RunningViewProps) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, (Date.now() - startedAt) / 1000),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.max(0, (Date.now() - startedAt) / 1000));
    }, 100);
    return () => {
      clearInterval(timer);
    };
  }, [startedAt]);

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
        borderStyle="round"
        borderColor={theme.edge}
      >
        <Box flexDirection="row">
          <Spinner type="dots" />
          <Text> </Text>
          <Text>
            <Text color={theme.muted}>正在把任务交给 </Text>
            <Text bold color={theme.text}>
              {agentName}
            </Text>
            <Text color={theme.muted}>，输出回来后在这里展示。</Text>
          </Text>
        </Box>
        <Text color={theme.dim} wrap="truncate-end">
          {prompt}
        </Text>
        <Box flexDirection="row">
          <Text bold color={theme.accent}>
            {`${elapsed.toFixed(1)}s`}
          </Text>
          <Text color={theme.dim}> 已运行</Text>
        </Box>
      </Box>
    </Box>
  );
}
