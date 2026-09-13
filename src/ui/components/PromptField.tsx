import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";

import { theme } from "../theme";

export interface PromptFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (value: string) => void;
  readonly isFocused: boolean;
}

/**
 * 唯一一处圆角：输入框是页面上唯一真正“可以被写”的东西，
 * 圆角让它看起来像一块能落笔的白板，而不是又一条列表行。
 */
export function PromptField({
  value,
  onChange,
  onSubmit,
  isFocused,
}: PromptFieldProps) {
  return (
    <Box flexDirection="column" paddingX={2}>
      <Box
        flexDirection="row"
        paddingX={1}
        paddingY={1}
        backgroundColor={theme.panel}
        borderStyle="round"
        borderColor={isFocused ? theme.accent : theme.edge}
      >
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
  );
}
