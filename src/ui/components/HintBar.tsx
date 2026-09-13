import { Box, Text } from "ink";

import { theme } from "../theme";

export type HintContext =
  | "scanning"
  | "picker"
  | "composer"
  | "running"
  | "detail"
  | "result";

export interface HintBarProps {
  readonly context: HintContext;
}

interface Hint {
  readonly key: string;
  readonly label: string;
}

const HINTS: Readonly<
  Record<Exclude<HintContext, "scanning">, readonly Hint[]>
> = {
  picker: [
    { key: "↑↓", label: "移动" },
    { key: "↵", label: "选择" },
    { key: "q", label: "退出" },
  ],
  composer: [
    { key: "↵", label: "执行任务" },
    { key: "tab", label: "交互模式" },
    { key: "esc", label: "返回" },
  ],
  running: [{ key: "ctrl c", label: "中止任务" }],
  detail: [
    { key: "↵ / esc", label: "返回" },
    { key: "q", label: "退出" },
  ],
  result: [
    { key: "↵", label: "继续交给" },
    { key: "esc", label: "重新选择" },
    { key: "q", label: "退出" },
  ],
};

export function HintBar({ context }: HintBarProps) {
  if (context === "scanning") {
    return (
      <Text color={theme.dim}>扫描完成后自动进入选择，稍等一下。</Text>
    );
  }

  return (
    <Box flexDirection="row">
      {HINTS[context].map((hint, index) => (
        <Text key={hint.key}>
          {index > 0 ? <Text color={theme.line}>{"  ·  "}</Text> : null}
          <Text bold color={theme.text}>{hint.key}</Text>
          <Text color={theme.muted}> {hint.label}</Text>
        </Text>
      ))}
    </Box>
  );
}
