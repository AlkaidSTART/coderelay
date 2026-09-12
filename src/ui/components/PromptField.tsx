import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";

import { theme } from "../theme";

export interface PromptFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (value: string) => void;
  readonly isFocused: boolean;
}

export function PromptField({
  value,
  onChange,
  onSubmit,
  isFocused,
}: PromptFieldProps) {
  return (
    <Box
      paddingX={2}
      backgroundColor={theme.panel}
      borderStyle="round"
      borderTop={false}
      borderBottom={false}
      borderLeft
      borderRight
      borderColor={isFocused ? theme.accent : theme.line}
    >
      <Text color={theme.accent}>❯ </Text>
      <TextInput
        defaultValue={value}
        placeholder="描述你要交给 agent 的任务…"
        onChange={onChange}
        onSubmit={onSubmit}
        isDisabled={!isFocused}
      />
    </Box>
  );
}
