import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";

import { theme } from "../theme";

export interface PromptFieldProps {
  readonly agentName: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (value: string) => void;
  readonly isFocused: boolean;
}

/**
 * 对话区（composer）：一块圆角玻璃板把「对话」与按钮提示隔开，
 * 说明文字和输入都在板内；聚焦时描边转系统蓝。
 */
export function PromptField({
  agentName,
  value,
  onChange,
  onSubmit,
  isFocused,
}: PromptFieldProps) {
  return (
    <Box flexDirection="column" paddingX={2}>
      <Box
        flexDirection="column"
        paddingX={1}
        paddingY={1}
        borderStyle="round"
        borderColor={isFocused ? theme.accent : theme.edge}
      >
        <Text>
          <Text color={theme.muted}>将任务交给 </Text>
          <Text bold color={theme.text}>
            {agentName}
          </Text>
        </Text>
        <Text color={theme.dim}>写清目标和完成标准，接力会更稳。</Text>
        <Box flexDirection="row" marginTop={1}>
          <Text bold={isFocused} color={isFocused ? theme.accent : theme.dim}>
            ❯{" "}
          </Text>
          <TextInput
            defaultValue={value}
            placeholder="写下任务，越具体越不容易跑偏…"
            onChange={onChange}
            onSubmit={onSubmit}
            isDisabled={!isFocused}
          />
        </Box>
      </Box>
    </Box>
  );
}
