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
    <Box paddingX={2}>
      <Box
        width="100%"
        flexDirection="row"
        paddingX={1}
        paddingY={1}
        backgroundColor={isFocused ? theme.panelActive : theme.panel}
      >
        <Text bold color={isFocused ? theme.accent : theme.dim}>
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
